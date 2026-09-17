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
from PIL import Image, ImageOps, UnidentifiedImageError
from app.poster_layout import text_rows, dates_and_scenes, choose_title

Image.MAX_IMAGE_PIXELS = 16_000_000


class OCRText(str):
    """Keep geometry/confidence internally without exposing OCR source to users."""
    def __new__(cls, value, blocks=None, quality=None):
        obj = super().__new__(cls, value)
        obj.blocks = blocks or []
        obj.quality = quality or {}
        return obj


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
            source = ImageOps.exif_transpose(source)
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
            payload = response.json()
            text = OCRText(payload['text'].strip()[:20000], payload.get('blocks', [])[:1000], payload.get('quality', {}))
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
    return "paddle-v5-layout-3" if os.environ.get("POSTER_OCR_URL") else "tesseract-fields-3"


LABELS = r'活动名称|音乐节名称|演出阵容|嘉宾阵容|艺人阵容|阵容|嘉宾|艺人|LINEUP|演出时间|活动时间|时间|日期|演出地点|活动地点|举办地点|地点|地址|主办单位|主办方|主办'


def layout_text(text):
    """Pair separate label/value boxes on the same row, without joining artist names."""
    blocks = getattr(text, 'blocks', [])
    if not blocks:
        return str(text)
    paired = []
    for block in blocks:
        label = block.get('text', '').strip()
        if not re.fullmatch(rf'(?:{LABELS})\s*[:：]?', label, re.I):
            continue
        box = block.get('box', [])
        if len(box) < 4:
            continue
        x = max(p[0] for p in box)
        y = sum(p[1] for p in box) / len(box)
        height = max(p[1] for p in box) - min(p[1] for p in box)
        neighbours = []
        for candidate in blocks:
            points = candidate.get('box', [])
            if len(points) < 4 or candidate is block:
                continue
            left = min(p[0] for p in points)
            cy = sum(p[1] for p in points) / len(points)
            if left >= x and abs(cy - y) <= max(6, height * .55):
                neighbours.append((left, candidate.get('text', '').strip()))
        values = []
        for _, value in sorted(neighbours):
            if re.match(rf'^(?:{LABELS})\s*[:：]?', value, re.I):
                break
            values.append(value)
        if values:
            separator = '、' if re.search('阵容|嘉宾|艺人|LINEUP', label, re.I) else ' '
            paired.append(label.rstrip(':：') + '：' + separator.join(values))
    return '\n'.join([*paired, str(text)])


def extract(text: str) -> dict:
    blocks = getattr(text, 'blocks', [])
    rows = text_rows(blocks)
    text = layout_text(text)
    # Tesseract often inserts spaces between individual Chinese characters.
    text = re.sub(r"(?<=[\u4e00-\u9fff]) +(?=[\u4e00-\u9fff])", "", text)
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    def field(labels: str):
        for index, line in enumerate(lines):
            match = re.match(rf"^(?:{labels})\s*[:：]?\s*(.*)$", line)
            if match:
                return (match[1] or (lines[index + 1] if index + 1 < len(lines) else ""))[:300] or None
        return None

    title = field("活动名称|音乐节名称") or choose_title(lines, rows)
    names = field("演出阵容|嘉宾阵容|艺人阵容|阵容|嘉宾|艺人|LINEUP")
    for index, line in enumerate(lines):
        if re.fullmatch(r"(?:演出阵容|嘉宾阵容|艺人阵容|阵容|嘉宾|艺人|LINEUP)\s*[:：]?", line) and not any(re.match(r'^(?:演出阵容|嘉宾阵容|艺人阵容|阵容|嘉宾|艺人|LINEUP)\s*[:：]\s*\S', earlier) for earlier in lines[:index]):
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
    spatial_time, scenes = dates_and_scenes('\n'.join(r['text'] for r in rows) if rows else text, rows)
    if not time:
        time = spatial_time
    place = field("演出地点|活动地点|举办地点|地点|地址")
    if not place:
        venue = next((line for line in lines if re.search(r"音乐厅|音乐馆|体育馆|体育场|剧院|剧场|会展中心|展览馆|美术馆|公园|广场|七彩盒子|LIVE\s*HOUSE", line, re.I)
                      and not re.search(r'巡回|TOUR|主办|出品', line, re.I)), None)
        city = next((line for line in lines if re.fullmatch(r"[\u4e00-\u9fff]{2,6}站", line)), None)
        place = " · ".join(part for part in (city, venue) if part) or None
        if venue:
            # A venue may wrap into a nearby subtitle, or two vertical columns.
            source = next((b for b in blocks if b.get('text') == venue), None)
            if source:
                x,y = min(p[0] for p in source['box']), min(p[1] for p in source['box'])
                w,h = max(p[0] for p in source['box'])-x, max(p[1] for p in source['box'])-y
                for other in blocks:
                    if other is source or other.get('score',0)<.8:
                        continue
                    pts=other['box']; ox,oy=min(p[0] for p in pts),min(p[1] for p in pts)
                    ow,oh=max(p[0] for p in pts)-ox,max(p[1] for p in pts)-oy
                    label=other['text']
                    if h>w*2 and oh>ow*2 and abs(oy-y)<h*.15 and 0<x-ox<w*1.5 and re.search('文化|国际',label):
                        place = (city+' · ' if city else '')+label+venue
                    elif h<w and abs(ox-x)<w*.3 and h*.5<oy-y<h*1.8 and re.fullmatch(r'[\u4e00-\u9fff]{2,8}(?:厅|馆)',label):
                        place = (city+' · ' if city else '')+venue+label
    if not artists and re.search(r'HIP\s*HOP|FESTIVAL|音乐节', title or '', re.I):
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
    if not artists:
        for line in lines:
            solo = re.match(r'^([\u4e00-\u9fffA-Za-z·.]+?)(?:[·\s]*20\d{2}全国巡演|个人巡回演唱会|\s*WORLD\s*TOUR)', line, re.I)
            if solo:
                artists = [solo[1]]
                break
        if not artists and title and '钢琴音乐会' in title:
            artist = title.split('钢琴音乐会')[0].strip()
            if artist:
                artists = [artist]
    cautions = []
    organizer = field('主办公司|主办单位|主办方|主办')
    if organizer and (organizer in {'公司','单位','方'} or re.search('支持|主办|授权|策展',organizer)):
        organizer = None
    if title and not re.search(r'音乐节|演唱会|巡演|音乐会|锦标赛|展览|喜剧|儿童剧|舞台剧|HIP\s*HOP|FESTIVAL|TOUR',title,re.I):
        cautions.append('活动名称可能不完整，需根据官方信息核实。')
    if re.search(r'金曲演唱会|致敬|翻唱', text):
        artists = []
        cautions.append('这是金曲或致敬类活动；海报中的原唱姓名、照片不代表本人到场，演出阵容待核实。')
    if len(scenes) > 1:
        time, place = None, None
        cautions.append('海报包含多个场次，请核对下面的城市、日期和场馆，再选择对应活动收藏。')
    elif time and not re.search(r'20\d{2}', time):
        cautions.append('未识别到明确年份，请以官方公告核实。')
    return {"name": title, "organizer": organizer,
            "time": time,
            "place": place,
            "artists": artists[:60], "scenes": scenes, "cautions": cautions}


def match_score(facts: dict, event) -> tuple[float, bool]:
    name, place = normalized(facts.get("name") or ""), normalized(facts.get("place") or "")
    if not name or not place:
        return 0, False
    candidate = normalized(event.name)
    venue = normalized(event.venue_name)
    specific_place = normalized((facts.get('place') or '').split(' · ')[-1])
    venue_score = SequenceMatcher(None, specific_place, venue).ratio()
    location_match = len(place) >= 2 and (place in normalized(event.city + event.address + event.venue_name)
                                          or (len(venue) >= 2 and venue in place) or (len(venue) >= 5 and venue_score >= .8))
    name_score = SequenceMatcher(None, name, candidate).ratio()
    score = name_score if location_match else 0
    # Only an exact event title plus its specific venue qualifies for automatic saving.
    from zoneinfo import ZoneInfo
    dates = re.findall(r"(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})", facts.get("time") or "")
    start = event.starts_at.astimezone(ZoneInfo("Asia/Shanghai"))
    same_date = (str(start.year), str(start.month), str(start.day)) in [tuple(str(int(v)) for v in parts) for parts in dates]
    exact = name == candidate and len(venue) >= 2 and venue in place and same_date
    # A single OCR typo can still identify a scene if title, specific venue and full date agree.
    strong = name_score >= .9 and len(venue) >= 2 and (venue in place or (len(venue) >= 5 and venue_score >= .9)) and same_date
    exact = (exact or strong) and len(facts.get('scenes', [])) <= 1 and not facts.get('cautions')
    return score, exact
