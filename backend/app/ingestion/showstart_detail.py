"""Read factual SSR detail fields. Never evaluate the remote Nuxt JavaScript."""

import json
import re
from dataclasses import replace
from datetime import datetime
from html.parser import HTMLParser
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from app.ingestion.common import HTML_VOID_ELEMENTS, normalize_text
from app.ingestion.coordinates import to_wgs84
from app.ingestion.enrichment_types import EnrichmentInfo, SourceCoordinates
from app.ingestion.types import IngestionItem

SHANGHAI = ZoneInfo("Asia/Shanghai")
DATE = re.compile(r"(?:(\d{4})[年/-])?(\d{1,2})[月/-](\d{1,2})日?\s+(\d{1,2}):(\d{2})")


class DetailHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.scripts: list[str] = []
        self.script: list[str] | None = None
        self.depth = 0
        self.describe_depth: int | None = None
        self.paragraph: list[str] | None = None
        self.paragraphs: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.script = []
        if tag not in HTML_VOID_ELEMENTS:
            self.depth += 1
        if "describe" in dict(attrs).get("class", "").split():
            self.describe_depth = self.depth
        if tag == "p" and self.describe_depth is not None:
            self.paragraph = []

    def handle_data(self, data):
        if self.script is not None:
            self.script.append(data)
        if self.paragraph is not None:
            self.paragraph.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.script is not None:
            script = "".join(self.script)
            if "window.__NUXT__=" in script:
                self.scripts.append(script)
            self.script = None
        if tag == "p" and self.paragraph is not None:
            self.paragraphs.append(normalize_text("".join(self.paragraph)))
            self.paragraph = None
        if self.depth == self.describe_depth:
            self.describe_depth = None
        if tag not in HTML_VOID_ELEMENTS:
            self.depth = max(0, self.depth - 1)


def _object(script: str, key: str) -> str:
    match = re.search(rf"\b{re.escape(key)}\s*:\s*\{{", script)
    if not match:
        return ""
    start = match.end() - 1
    depth, quoted, escaped = 0, False, False
    for index in range(start, len(script)):
        char = script[index]
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return script[start : index + 1]
    return ""


def _constants(script: str) -> dict:
    params = re.search(r"function\(([^)]*)\)\s*\{return", script)
    args = re.search(r"\}\s*\(([^\n]*)\)\s*\)\s*;?\s*$", script)
    if not params or not args:
        return {}
    try:
        values = json.loads("[" + args[1] + "]")
        return dict(zip((key.strip() for key in params[1].split(",")), values, strict=True))
    except (ValueError, TypeError):
        return {}


def _scalar(script: str, key: str, constants: dict):
    match = re.search(
        rf"(?:^|[{{,])\s*{re.escape(key)}\s*:\s*"
        r'("(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?|[a-zA-Z_$][\w$]*)',
        script,
    )
    if not match:
        return None
    try:
        return json.loads(match[1])
    except ValueError:
        value = constants.get(match[1])
        return value if isinstance(value, (str, int, float)) else None


def parse_times(value: str, anchor: datetime | None) -> tuple[datetime | None, datetime | None]:
    """Use the listing's year, never ticket sale/closing dates or today's year."""
    matches = list(DATE.finditer(value))
    if not matches or len(matches) > 2:
        return None, None
    if len(matches) == 2 and value[matches[0].end() : matches[1].start()].strip() not in {
        "-",
        "~",
        "～",
        "至",
        "—",
        "–",
    }:
        return None, None
    dates: list[datetime] = []
    for match in matches:
        year, month, day, hour, minute = match.groups()
        reference = dates[0] if dates else (anchor.astimezone(SHANGHAI) if anchor else None)
        if not year and reference is None:
            return None, None
        inferred_year = int(year) if year else reference.year
        if dates and not year and dates[0].month == 12 and int(month) == 1:
            inferred_year += 1
        try:
            dates.append(
                datetime(
                    inferred_year, int(month), int(day), int(hour), int(minute), tzinfo=SHANGHAI
                )
            )
        except ValueError:
            return None, None
    if anchor and not matches[0][1]:
        local = anchor.astimezone(SHANGHAI)
        if (dates[0].month, dates[0].day) != (local.month, local.day):
            return None, None
    end = dates[1] if len(dates) == 2 and dates[1] > dates[0] else None
    return dates[0], end


def parse_showstart_detail(html: str, item: IngestionItem) -> IngestionItem:
    parser = DetailHTML()
    parser.feed(html)
    info = EnrichmentInfo(detail_url=item.canonical_url, detail_status="ok")
    script = next(iter(parser.scripts), "")
    constants = _constants(script)
    route = _scalar(script, "routePath", constants)
    if route and route != urlsplit(item.canonical_url).path:
        raise ValueError("Showstart returned a different event")
    detail = _object(script, "detail")
    site = _object(detail, "site")
    if not detail and not parser.paragraphs:
        raise ValueError("No recognizable Showstart event details")
    values = {}
    for source, field in (("name", "venue_name"), ("address", "address"), ("cityName", "city")):
        value = _scalar(site, source, constants)
        if isinstance(value, str) and value.strip():
            values[field] = normalize_text(value)
    for paragraph in parser.paragraphs:
        if paragraph.startswith("地址：") and not values.get("address"):
            values["address"] = paragraph.removeprefix("地址：").removesuffix("查看地图").strip()
    title = _scalar(detail, "title", constants)
    if isinstance(title, str) and title:
        values["title"] = normalize_text(title)
    site_id = _scalar(site, "id", constants)
    if str(site_id).isdigit():
        info.venue_url = f"https://www.showstart.com/venue/{site_id}"
    address = values.get("address", "")
    city = values.get("city", item.city)
    if city:
        district = re.search(
            re.escape(city.removesuffix("市")) + r"市?([^市区县]{1,12}[区县])", address
        )
        if district:
            values["district"] = district[1]
    time_text = _scalar(detail, "showTime", constants)
    if not isinstance(time_text, str):
        time_text = next(
            (p.removeprefix("演出时间：") for p in parser.paragraphs if p.startswith("演出时间：")),
            "",
        )
    info.time_text = time_text or None
    start, end = parse_times(time_text, item.starts_at)
    if start:
        values["starts_at"] = start
    if end:
        values["ends_at"] = end
    elif time_text:
        info.warnings.append("详情时间缺少年份、存在多场次或时间范围不完整，请核实。")
    longitude = _scalar(site, "longitude", constants)
    latitude = _scalar(site, "latitude", constants)
    if longitude is not None and latitude is not None:
        try:
            longitude, latitude = float(longitude), float(latitude)
            values["longitude"], values["latitude"] = to_wgs84(longitude, latitude, "bd09")
            info.source_coordinates = SourceCoordinates(
                longitude=longitude, latitude=latitude, system="bd09"
            )
            info.location_method = "showstart"
        except (ValueError, TypeError):
            info.warnings.append("来源场馆坐标无效，请核实地点。")
    return replace(item, **values, facts={**item.facts, "enrichment": info.model_dump()})
