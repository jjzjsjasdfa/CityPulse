"""Internal, CPU-only OCR worker. One model instance; one inference at a time."""
import io
import os
import time
from threading import Lock

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from PIL import Image
from starlette.concurrency import run_in_threadpool

app = FastAPI()
lock = Lock()
model = None


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None}


def recognize(data):
    global model
    if not lock.acquire(blocking=False):
        raise HTTPException(429, "识别服务繁忙，请稍后重试")
    started = time.monotonic()
    try:
        from paddleocr import PaddleOCR
        if model is None:
            model = PaddleOCR(
                text_detection_model_name="PP-OCRv5_server_det",
                text_recognition_model_name="PP-OCRv5_server_rec",
                use_doc_orientation_classify=False, use_doc_unwarping=False,
                use_textline_orientation=False, device="cpu", cpu_threads=4,
                enable_mkldnn=True,
            )
        with Image.open(io.BytesIO(data)) as image:
            if image.width * image.height > 16_000_000:
                raise HTTPException(413, "图片尺寸过大")
            image.thumbnail((2400, 3200))
            array = np.asarray(image.convert("RGB"))[:, :, ::-1].copy()
        output = next(iter(model.predict(array)))
        blocks = []
        for text, score, polygon in zip(output["rec_texts"], output["rec_scores"], output["rec_polys"]):
            blocks.append({"text": str(text), "score": round(float(score), 4), "box": np.asarray(polygon).tolist()})
        blocks.sort(key=lambda b: (min(p[1] for p in b["box"]), min(p[0] for p in b["box"])))
        return {"text": "\n".join(b["text"] for b in blocks if b["score"] >= .5),
                "blocks": blocks, "engine": "PP-OCRv5-server", "seconds": round(time.monotonic()-started, 2)}
    finally:
        lock.release()


@app.post("/recognize")
async def predict(request: Request):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 24 * 1024 * 1024:
            raise HTTPException(413, "图片过大")
    try:
        return await run_in_threadpool(recognize, bytes(data))
    except HTTPException:
        raise
    except Exception:
        import logging
        logging.exception("OCR failed")
        raise HTTPException(503, "模型下载或识别失败，请检查 OCR 服务日志") from None
