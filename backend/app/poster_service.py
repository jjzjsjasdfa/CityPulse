"""Local OCR: images never leave this server. Extract evidence, not guessed facts."""
import io
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

Image.MAX_IMAGE_PIXELS = 16_000_000


def recognize(data: bytes) -> tuple[bytes, str]:
    worker_url = os.environ.get("POSTER_OCR_URL")
    if not worker_url and not shutil.which("tesseract"):
        raise HTTPException(503, "中文识别服务未安装，请使用更新后的 Docker 后端。")
    try:
        with Image.open(io.BytesIO(data)) as source:
            if source.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError()
            if source.width * source.height > 16_000_000:
                raise ValueError()
            source.thumbnail((2400, 3200))
            output = io.BytesIO()
            source.convert("RGB").save(output, "PNG")
            clean = output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "请选择有效的 JPG、PNG 或 WebP 图片（不超过 1600 万像素）。") from None
    if worker_url:
        import httpx
        try:
            response = httpx.post(worker_url.rstrip('/') + '/recognize', content=clean,
                                  headers={"Content-Type": "image/png"}, timeout=180)
            if response.status_code == 429:
                raise HTTPException(429, "识别任务较多，请稍后重试")
            response.raise_for_status()
            text = response.json()["text"].strip()[:20000]
        except (httpx.HTTPError, ValueError, KeyError):
            raise HTTPException(503, "飞桨识别暂不可用，首次启动需要下载模型，请稍后重试。") from None
        if not text:
            raise HTTPException(422, "没有识别到清晰文字，请更换图片")
        return clean, text
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "poster.png"
        path.write_bytes(clean)
        try:
            result = subprocess.run(
                ["tesseract", str(path), "stdout", "-l", "chi_sim+eng", "--psm", "6"],
                capture_output=True, timeout=45, check=True,
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(504, "识别超时，请裁剪海报后重试。") from None
        except subprocess.CalledProcessError:
            raise HTTPException(503, "识别服务暂不可用，请稍后重试。") from None
    text = result.stdout.decode("utf-8", errors="replace").strip()[:20000]
    if not text:
        raise HTTPException(422, "没有识别到文字，请选择清晰的活动海报。")
    return clean, text


def normalized(text: str) -> str:
    return re.sub(r"[\W_]", "", unicodedata.normalize("NFKC", text)).casefold()


def pipeline_version() -> str:
    return "paddle-v5-fields-1" if os.environ.get("POSTER_OCR_URL") else "tesseract-fields-1"


def extract(text: str) -> dict:
    # Tesseract often inserts spaces between individual Chinese characters.
    text = re.sub(r"(?<=[\u4e00-\u9fff]) +(?=[\u4e00-\u9fff])", "", text)
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    def field(labels: str):
        for index, line in enumerate(lines):
            match = re.match(rf"^(?:{labels})\s*[:：]?\s*(.*)$", line)
            if match:
                return (match[1] or (lines[index + 1] if index + 1 < len(lines) else ""))[:300] or None
        return None

    title = field("活动名称|音乐节名称")
    if not title:
        title = next((line for line in lines if re.search("音乐节|演唱会|演出|艺术节", line)
                      and not re.match("主办|时间|地址|地点|阵容", line)), None)
    if not title:
        title = next((line for line in lines if re.search(r"HIP\s*HOP|FESTIVAL|\bLIVE\b|\bTOUR\b|音乐会|说唱", line, re.I)), None)
    names = field("演出阵容|嘉宾阵容|艺人阵容|阵容|嘉宾|艺人|LINEUP")
    for index, line in enumerate(lines):
        if re.fullmatch(r"(?:演出阵容|嘉宾阵容|艺人阵容|阵容|嘉宾|艺人|LINEUP)\s*[:：]?", line):
            block = []
            for following in lines[index + 1:index + 61]:
                if re.match(r"主办|承办|时间|日期|地点|地址|票价|购票|活动|演出时间|演出地点", following):
                    break
                block.append(following)
            names = "、".join(block)
            break
    artists = [part.strip() for part in re.split(r"[、,，/|·;；]+", names or "") if part.strip()]
    time = field("演出时间|活动时间|时间|日期")
    if not time:
        time = next((line for line in lines if re.search(r"20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}", line)), None)
    clock = next((line for line in lines if re.fullmatch(r"\d{1,2}[:：]\d{2}", line)), None)
    if time and clock and clock not in time:
        time += " " + clock
    place = field("演出地点|活动地点|举办地点|地点|地址")
    if not place:
        venue = next((line for line in lines if re.search(r"音乐厅|音乐馆|体育馆|体育场|剧院|会展中心|展览馆|美术馆|公园|广场|LIVE\s*HOUSE", line, re.I)), None)
        city = next((line for line in lines if re.fullmatch(r"[\u4e00-\u9fff]{2,6}站", line)), None)
        place = " · ".join(part for part in (city, venue) if part) or None
    if not artists:
        # Unlabelled lineups are usually a consecutive group of short names.
        # Do not treat a lone title or a venue as a performer. Keep it tentative.
        groups, group = [], []
        for line in [*lines, ""]:
            candidate = (2 <= len(line) <= 40 and re.fullmatch(r"[\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9 .·_-]*", line)
                         and line not in {title, clock} and not re.search(r"音乐|主办|文化|公司|场|馆|中心|公园|剧院|站$|HIP\s*HOP|FESTIVAL|TICKET|SEPT?\b|FRIDAY|STATION|TOUR", line, re.I))
            if candidate:
                group.append(line)
            else:
                if len(group) >= 2:
                    groups.append(group)
                group = []
        if groups:
            artists = max(groups, key=len)[:60]
    return {"name": title, "organizer": field("主办单位|主办方|主办"),
            "time": time,
            "place": place,
            "artists": artists[:60]}


def match_score(facts: dict, event) -> tuple[float, bool]:
    name, place = normalized(facts.get("name") or ""), normalized(facts.get("place") or "")
    if not name or not place:
        return 0, False
    candidate = normalized(event.name)
    venue = normalized(event.venue_name)
    location_match = len(place) >= 2 and (place in normalized(event.city + event.address + event.venue_name)
                                          or (len(venue) >= 2 and venue in place))
    score = SequenceMatcher(None, name, candidate).ratio() if location_match else 0
    # Only an exact event title plus its specific venue qualifies for automatic saving.
    from zoneinfo import ZoneInfo
    dates = re.findall(r"(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})", facts.get("time") or "")
    start = event.starts_at.astimezone(ZoneInfo("Asia/Shanghai"))
    same_date = (str(start.year), str(start.month), str(start.day)) in [tuple(str(int(v)) for v in parts) for parts in dates]
    exact = name == candidate and len(venue) >= 2 and venue in place and same_date
    return score, exact
