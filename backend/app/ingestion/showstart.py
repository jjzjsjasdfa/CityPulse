from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
from zoneinfo import ZoneInfo

import httpx

from app.ingestion.common import HTML_VOID_ELEMENTS, assert_robots_allowed, normalize_text
from app.ingestion.types import IngestionItem, SourceSpec
from app.models import EventCategory, SourceLevel

SHANGHAI = ZoneInfo("Asia/Shanghai")
EVENT_PATH = re.compile(r"^/event/(?P<id>\d+)$")
CARD_FIELDS = {"name", "price", "time", "addr"}


@dataclass
class _Card:
    href: str
    depth: int
    fields: dict[str, list[str]] = field(default_factory=dict)
    active_field: str | None = None
    field_depth: int | None = None


class _ShowStartParser(HTMLParser):
    """Parse the event cards that are present in ShowStart's server-rendered HTML."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.card: _Card | None = None
        self.cards: list[_Card] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.depth += 1
        attributes = dict(attrs)
        href = attributes.get("href")
        if self.card is None and tag == "a" and href and EVENT_PATH.match(href):
            self.card = _Card(href=href, depth=self.depth)
        elif self.card is not None and tag == "p":
            classes = set((attributes.get("class") or "").split())
            field_name = next((name for name in CARD_FIELDS if name in classes), None)
            if field_name:
                self.card.active_field = field_name
                self.card.field_depth = self.depth
                self.card.fields.setdefault(field_name, [])

        if tag in HTML_VOID_ELEMENTS:
            self.depth = max(0, self.depth - 1)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag not in HTML_VOID_ELEMENTS:
            self.handle_endtag(tag)

    def handle_data(self, data: str) -> None:
        if self.card is None or self.card.active_field is None:
            return
        text = normalize_text(data)
        if text:
            self.card.fields[self.card.active_field].append(text)

    def handle_endtag(self, tag: str) -> None:
        if (
            self.card is not None
            and tag == "p"
            and self.card.field_depth == self.depth
        ):
            self.card.active_field = None
            self.card.field_depth = None
        if self.card is not None and tag == "a" and self.card.depth == self.depth:
            self.cards.append(self.card)
            self.card = None
        self.depth = max(0, self.depth - 1)


def _field(card: _Card, name: str) -> str:
    return normalize_text(" ".join(card.fields.get(name, [])))


def _parse_start(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y/%m/%d %H:%M").replace(tzinfo=SHANGHAI)
    except ValueError:
        return None


def _price_text(card: _Card) -> str | None:
    value = re.sub(r"^价格：\s*", "", _field(card, "price"))
    return value or None


def parse_showstart_venue(html: str, base_url: str) -> list[IngestionItem]:
    parser = _ShowStartParser()
    parser.feed(html)
    source_host = urlsplit(base_url).netloc.lower()
    items: list[IngestionItem] = []
    seen: set[str] = set()

    for card in parser.cards:
        title = _field(card, "name")
        starts_at = _parse_start(_field(card, "time"))
        canonical_url = urljoin(base_url, card.href)
        if (
            not title
            or starts_at is None
            or urlsplit(canonical_url).netloc.lower() != source_host
            or canonical_url in seen
        ):
            continue
        seen.add(canonical_url)
        venue_name = _field(card, "addr") or None
        items.append(
            IngestionItem(
                title=title,
                canonical_url=canonical_url,
                source_status="listed",
                starts_at=starts_at,
                category=EventCategory.performance,
                price=_price_text(card),
                venue_name=venue_name,
                city="长沙",
                district="开福区" if venue_name == "长沙音乐厅" else None,
            )
        )
    return items


class ShowStartVenueAdapter:
    source = SourceSpec(
        key="showstart-changsha-concert-hall",
        name="秀动：长沙音乐厅",
        url="https://www.showstart.com/venue/1344034",
        level=SourceLevel.lead,
        is_official=False,
        reliability_score=0.7,
    )
    def __init__(self, *, user_agent: str, timeout_seconds: float = 20) -> None:
        if "contact-required" in user_agent:
            raise ValueError(
                "Set INGESTION_USER_AGENT to include your real contact email "
                "or URL before fetching."
            )
        self.user_agent = user_agent
        self.client = httpx.Client(
            headers={"User-Agent": user_agent},
            timeout=timeout_seconds,
            follow_redirects=True,
        )

    def fetch(self, *, limit: int = 20) -> list[IngestionItem]:
        assert_robots_allowed(self.client, self.source.url, self.user_agent)
        response = self.client.get(self.source.url)
        response.raise_for_status()
        items = parse_showstart_venue(response.text, self.source.url)[:limit]
        if not items:
            raise RuntimeError(
                "ShowStart returned no recognizable venue events; its layout may have changed."
            )
        return items

    def close(self) -> None:
        self.client.close()

    def __enter__(self) -> ShowStartVenueAdapter:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()
