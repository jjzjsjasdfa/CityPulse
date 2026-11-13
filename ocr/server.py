"""Internal, CPU-only OCR worker. One model instance; one inference at a time."""
import io
import os
import re
import time
from threading import Lock

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from PIL import Image, ImageFilter, ImageOps
from starlette.concurrency import run_in_threadpool

app = FastAPI()
lock = Lock()
model = None


def predict_blocks(image):
    array = np.asarray(image.convert('RGB'))[:, :, ::-1].copy()
    output = next(iter(model.predict(array, text_det_limit_type='max', text_det_limit_side_len=1600)))
    return [{'text': str(text), 'score': round(float(score), 4), 'box': np.asarray(polygon).tolist()}
            for text, score, polygon in zip(output['rec_texts'], output['rec_scores'], output['rec_polys'])]


def refine_blocks(image, blocks):
    """Bounded retries on weak text lines; do not rerun the whole poster per field."""
    candidates = [b for b in blocks if 4 <= len(b['text']) <= 120 and .5 <= b['score'] < .95
                  and (re.search(r'馆|中心|公园|剧院|主办|公司|体育场', b['text']) or b['score'] < .85)]
    candidates.sort(key=lambda b: (not bool(re.search(r'馆|中心|公园|剧院|主办|公司|体育场', b['text'])), b['score']))
    retries = 0
    for block in candidates[:4]:
        points = block['box']
        left, right = min(p[0] for p in points), max(p[0] for p in points)
        top, bottom = min(p[1] for p in points), max(p[1] for p in points)
        padding = max(4, int((bottom-top)*.2))
        crop = image.crop((max(0,left-padding), max(0,top-padding), min(image.width,right+padding), min(image.height,bottom+padding)))
        if crop.width < 4 or crop.height < 4:
            continue
        # Colored letters on textured posters may disappear in ordinary grayscale.
        pixels = np.asarray(crop)
        channel_contrast = np.percentile(pixels, 90, axis=(0,1)) - np.percentile(pixels, 10, axis=(0,1))
        gray = np.asarray(crop.convert('L'))
        gray_contrast = np.percentile(gray,90) - np.percentile(gray,10)
        channel = int(np.argmax(channel_contrast))
        separated = channel_contrast[channel] > max(50, gray_contrast * 1.2)
        crop = crop.getchannel(channel) if separated else crop.convert('L')
        crop = ImageOps.autocontrast(crop).convert('RGB')
        if crop.height < 80:
            scale = 3
            crop = crop.resize((int(crop.width*scale), int(crop.height*scale)), Image.Resampling.LANCZOS)
        if not separated:
            crop = crop.filter(ImageFilter.UnsharpMask(radius=1, percent=120, threshold=3))
        options = predict_blocks(crop)
        retries += 1
        # Only one line may replace one line; avoid combining neighbouring names.
        options = [b for b in options if len(b['text']) >= max(3, len(block['text'])*.7)]
        improved = len(options) == 1 and options[0]['score'] >= block['score'] + .015
        if improved:
            block['first_pass'] = {'text': block['text'], 'score': block['score']}
            block['text'], block['score'] = options[0]['text'], options[0]['score']
    return retries


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
            image = ImageOps.exif_transpose(image).convert('RGB')
            original_size = image.size
            image.thumbnail((2400, 3200))
            image = image.copy()
        blocks = predict_blocks(image)
        retries = refine_blocks(image, blocks)
        blocks.sort(key=lambda b: (min(p[1] for p in b["box"]), min(p[0] for p in b["box"])))
        retained = [b for b in blocks if b['score'] >= .5]
        return {"text": "\n".join(b["text"] for b in blocks if b["score"] >= .5),
                "blocks": retained, "engine": "PP-OCRv5-server", 'passes': 1 + retries,
                'quality': {'small_image': min(original_size) < 650,
                            'uncertain_lines': sum(b['score'] < .8 for b in retained)},
                "seconds": round(time.monotonic()-started, 2)}
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
