from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

import httpx

from app.ingestion.common import HTML_VOID_ELEMENTS, assert_robots_allowed, normalize_text
from app.ingestion.types import IngestionItem, SourceSpec
from app.models import SourceLevel

ACTIVITY_PATH = "/zh-hans/huodong_zhuanti"
SHANGHAI = ZoneInfo("Asia/Shanghai")
STATUS_LABELS = ("可预约", "已约满", "已结束")
DATE_PATTERN = re.compile(r"(?P<date>20\d{2}-\d{2}-\d{2})(?:\s+(?P<time>\d{2}:\d{2}))?")
MuseumListingItem = IngestionItem


@dataclass
class _Block:
    depth: int
    text: list[str]
    links: list[tuple[str, list[str]]]
    active_link: list[str] | None = None


class _ListingParser(HTMLParser):
    """Small dependency-free parser for Drupal-style listing rows."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.block: _Block | None = None
        self.blocks: list[tuple[str, list[tuple[str, str]]]] = []
        self.fallback_links: list[tuple[str, str]] = []
        self._fallback_link: tuple[str, list[str]] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.depth += 1
        attributes = dict(attrs)
        classes = set((attributes.get("class") or "").split())
        starts_row = tag in {"article", "li"} or any(
            token == "views-row"
            or token.endswith("-item")
            or token.startswith("activity-item")
            for token in classes
        )
        if self.block is None and starts_row:
            self.block = _Block(depth=self.depth, text=[], links=[])

        href = attributes.get("href") if tag == "a" else None
        if href:
            link_text: list[str] = []
            if self.block is not None:
                self.block.links.append((href, link_text))
                self.block.active_link = link_text
            else:
                self._fallback_link = (href, link_text)

        # HTMLParser does not emit end tags for these HTML void elements.
        if tag in HTML_VOID_ELEMENTS:
            self.depth = max(0, self.depth - 1)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag not in HTML_VOID_ELEMENTS:
            self.handle_endtag(tag)

    def handle_data(self, data: str) -> None:
        text = normalize_text(data)
        if not text:
            return
        if self.block is not None:
            self.block.text.append(text)
            if self.block.active_link is not None:
                self.block.active_link.append(text)
        elif self._fallback_link is not None:
            self._fallback_link[1].append(text)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a":
            if self.block is not None:
                self.block.active_link = None
            elif self._fallback_link is not None:
                href, parts = self._fallback_link
                self.fallback_links.append((href, normalize_text(" ".join(parts))))
                self._fallback_link = None

        if self.block is not None and self.depth == self.block.depth:
            links = [(href, normalize_text(" ".join(parts))) for href, parts in self.block.links]
            self.blocks.append((" ".join(self.block.text), links))
            self.block = None
        self.depth = max(0, self.depth - 1)


def canonicalize_url(base_url: str, href: str) -> str:
    absolute = urljoin(base_url, href)
    parts = urlsplit(absolute)
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, "", ""))


def _is_activity_detail(url: str) -> bool:
    path = urlsplit(url).path.rstrip("/")
    return path.startswith(f"{ACTIVITY_PATH}/") and path != ACTIVITY_PATH


def _parse_datetime(text: str) -> datetime | None:
    match = DATE_PATTERN.search(text)
    if match is None:
        return None
    clock = match.group("time") or "00:00"
    return datetime.strptime(f"{match.group('date')} {clock}", "%Y-%m-%d %H:%M").replace(
        tzinfo=SHANGHAI
    )


def parse_listing(html: str, base_url: str) -> list[MuseumListingItem]:
    parser = _ListingParser()
    parser.feed(html)
    rows = parser.blocks + [("", [link]) for link in parser.fallback_links]
    items: list[MuseumListingItem] = []
    seen: set[str] = set()
    source_host = urlsplit(base_url).netloc.lower()

    for context, links in rows:
        status = next((label for label in STATUS_LABELS if label in context), None)
        published_at = _parse_datetime(context)
        for href, title in links:
            url = canonicalize_url(base_url, href)
            if (
                not title
                or urlsplit(url).netloc.lower() != source_host
                or not _is_activity_detail(url)
                or url in seen
            ):
                continue
            seen.add(url)
            items.append(
                MuseumListingItem(
                    title=title,
                    canonical_url=url,
                    source_status=status,
                    source_published_at=published_at,
                    organizer="湖南博物院",
                )
            )
    return items


class HunanMuseumAdapter:
    source = SourceSpec(
        key="hunan-museum",
        name="湖南博物院活动专题",
        url="https://www.hnmuseum.com/zh-hans/huodong_zhuanti",
        level=SourceLevel.authority,
        is_official=True,
        reliability_score=0.95,
    )
    def __init__(self, *, base_url: str, user_agent: str, timeout_seconds: float = 20) -> None:
        if "contact-required" in user_agent:
            raise ValueError(
                "Set INGESTION_USER_AGENT to include your real contact email "
                "or URL before fetching."
            )
        self.base_url = base_url.rstrip("/")
        self.user_agent = user_agent
        self.client = httpx.Client(
            headers={"User-Agent": user_agent},
            timeout=timeout_seconds,
            follow_redirects=True,
        )

    @property
    def listing_url(self) -> str:
        return f"{self.base_url}{ACTIVITY_PATH}"

    def fetch(self, *, limit: int = 20) -> list[MuseumListingItem]:
        assert_robots_allowed(self.client, self.listing_url, self.user_agent)
        response = self.client.get(self.listing_url, params={"page": 0})
        response.raise_for_status()
        items = parse_listing(response.text, self.base_url)[:limit]
        if not items:
            raise RuntimeError(
                "The Hunan Museum page returned no recognizable activity links; "
                "its layout may have changed."
            )
        return items

    def close(self) -> None:
        self.client.close()

    def __enter__(self) -> HunanMuseumAdapter:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()
