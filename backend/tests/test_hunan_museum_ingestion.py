from pathlib import Path

import httpx
import pytest
from sqlalchemy import func
from sqlmodel import Session, SQLModel, create_engine, select

from app.ingestion.common import RobotsPolicyError, assert_robots_allowed
from app.ingestion.hunan_museum import MuseumListingItem, parse_listing
from app.ingestion.runner import _upsert_item
from app.models import EventCandidate, RawSourceItem, Source, SourceLevel

FIXTURE = Path(__file__).parent / "fixtures" / "hunan_museum_listing.html"
BASE_URL = "https://www.hnmuseum.com"


def test_parse_listing_extracts_only_detail_links() -> None:
    items = parse_listing(FIXTURE.read_text(encoding="utf-8"), BASE_URL)

    assert len(items) == 2
    assert items[0].title == "活动预约｜秋日历史工坊"
    assert items[0].source_status == "可预约"
    assert items[0].source_published_at is not None
    assert items[0].source_published_at.isoformat() == "2026-09-10T09:30:00+08:00"
    assert items[0].canonical_url.endswith("/autumn-history-workshop")
    assert len(items[0].external_id) == 64
    assert items[0].external_id != items[1].external_id


def test_parse_listing_ignores_images_navigation_and_off_domain_links() -> None:
    html = """
    <div class="views-row">
      <a href="/zh-hans/huodong_zhuanti/real"><img src="cover.jpg" /></a>
      <a href="/zh-hans/huodong_zhuanti/real">Real activity</a>
    </div>
    <a href="/zh-hans/huodong_zhuanti?page=1">Next</a>
    <a href="https://example.com/zh-hans/huodong_zhuanti/fake">External</a>
    """

    items = parse_listing(html, BASE_URL)

    assert [item.title for item in items] == ["Real activity"]


def test_robots_guard_allows_an_explicitly_allowed_path() -> None:
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(200, text="User-agent: *\nAllow: /zh-hans/\n")
    )
    with httpx.Client(transport=transport) as client:
        assert_robots_allowed(
            client,
            f"{BASE_URL}/zh-hans/huodong_zhuanti",
            "CityPulse/0.1",
        )


def test_robots_guard_fails_closed_when_policy_is_unavailable() -> None:
    transport = httpx.MockTransport(lambda _request: httpx.Response(503))
    with httpx.Client(transport=transport) as client:
        with pytest.raises(RobotsPolicyError, match="Could not verify"):
            assert_robots_allowed(
                client,
                f"{BASE_URL}/zh-hans/huodong_zhuanti",
                "CityPulse/0.1",
            )


def test_upsert_is_idempotent() -> None:
    sqlite_engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(
        sqlite_engine,
        tables=[Source.__table__, RawSourceItem.__table__, EventCandidate.__table__],
    )
    item = MuseumListingItem(
        title="Hunan Museum activity",
        canonical_url=f"{BASE_URL}/zh-hans/huodong_zhuanti/autumn-history-workshop",
        source_status="available",
    )
    with Session(sqlite_engine) as session:
        source = Source(
            name="Hunan Museum activities",
            url=f"{BASE_URL}/zh-hans/huodong_zhuanti",
            level=SourceLevel.authority,
            is_official=True,
            reliability_score=0.95,
        )
        session.add(source)
        session.flush()

        assert _upsert_item(session, source, item) == (True, True)
        session.commit()
        assert _upsert_item(session, source, item) == (False, False)
        session.commit()

        assert session.exec(select(func.count()).select_from(RawSourceItem)).one() == 1
        assert session.exec(select(func.count()).select_from(EventCandidate)).one() == 1
