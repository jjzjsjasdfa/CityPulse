from dataclasses import replace
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pytest

from app.ingestion.registry import adapter_keys
from app.ingestion.showstart import ShowStartVenueAdapter, parse_showstart_venue
from app.ingestion.showstart_detail import parse_showstart_detail, parse_times
from app.ingestion.types import IngestionItem
from app.models import EventCategory, SourceLevel

FIXTURE = Path(__file__).parent / "fixtures" / "showstart_venue.html"
BASE_URL = "https://www.showstart.com/venue/1344034"


def test_parse_real_showstart_card_shape() -> None:
    items = parse_showstart_venue(FIXTURE.read_text(encoding="utf-8"), BASE_URL)

    assert len(items) == 2
    assert items[0].title == "测试交响音乐会"
    assert items[0].canonical_url == "https://www.showstart.com/event/100001"
    assert items[0].starts_at is not None
    assert items[0].starts_at.isoformat() == "2026-10-05T19:30:00+08:00"
    assert items[0].venue_name == "长沙音乐厅"
    assert items[0].price == "¥80起"
    assert items[0].category == EventCategory.performance


def test_showstart_is_registered_as_a_non_official_lead() -> None:
    assert ShowStartVenueAdapter.source.key in adapter_keys()
    assert ShowStartVenueAdapter.source.level == SourceLevel.lead
    assert ShowStartVenueAdapter.source.is_official is False


def test_legacy_contact_placeholder_uses_truthful_product_identifier():
    with ShowStartVenueAdapter(user_agent="CityPulse/0.1 (contact-required)") as adapter:
        assert adapter.user_agent == "CityPulse/0.1"
        assert adapter.client.headers["User-Agent"] == "CityPulse/0.1"


def detail_item():
    return IngestionItem(
        title="Concert",
        canonical_url="https://www.showstart.com/event/305131",
        city="长沙",
        venue_name="长沙音乐厅",
        starts_at=datetime(2026, 8, 29, 19, 30, tzinfo=ZoneInfo("Asia/Shanghai")),
    )


def test_detail_address_time_and_normalized_coordinates():
    html = FIXTURE.with_name("showstart_detail.html").read_text(encoding="utf-8")
    item = parse_showstart_detail(html, detail_item())
    assert item.address == "长沙市开福区滨江文化园3长沙音乐厅"
    assert item.district == "开福区"
    assert item.starts_at.isoformat() == "2026-08-29T19:30:00+08:00"
    assert item.ends_at.isoformat() == "2026-08-29T21:20:00+08:00"
    assert item.longitude == pytest.approx(112.973186, abs=0.00001)
    assert item.latitude == pytest.approx(28.2461807, abs=0.00001)
    assert item.facts["enrichment"]["source_coordinates"]["system"] == "bd09"
    assert "tickets" not in item.payload() and "content" not in item.payload()


def test_never_infer_event_year_from_ticket_sale_or_closing_time():
    html = FIXTURE.with_name("showstart_detail.html").read_text(encoding="utf-8")
    item = parse_showstart_detail(html, replace(detail_item(), starts_at=None))
    assert item.starts_at is None and item.ends_at is None
    assert item.facts["enrichment"]["time_text"] == "08月29日 19:30-08月29日 21:20"
    assert item.facts["enrichment"]["warnings"]


def test_cross_year_and_conflicting_dates():
    anchor = datetime(2026, 12, 31, 23, 0, tzinfo=ZoneInfo("Asia/Shanghai"))
    start, end = parse_times("12月31日 23:00-01月01日 01:00", anchor)
    assert end.year == 2027 and start.year == 2026
    assert parse_times("08月29日 19:30-08月29日 21:20", anchor) == (None, None)
    start, end = parse_times("2026年08月29日 19:30-08月29日 21:20", None)
    assert start.year == 2026 and end.hour == 21
    assert parse_times("08月29日 19:30、08月30日 19:30", detail_item().starts_at) == (None, None)
    utc_anchor = datetime.fromisoformat("2026-12-31T18:00:00+00:00")
    start, end = parse_times("01月01日 02:00-01月01日 03:00", utc_anchor)
    assert start.year == 2027 and end.year == 2027


def test_invalid_coordinates_and_remote_script_are_not_executed():
    html = FIXTURE.with_name("showstart_detail.html").read_text(encoding="utf-8")
    html = html.replace("longitude:112.985335", "longitude:999")
    item = parse_showstart_detail(html, detail_item())
    assert item.longitude is None and item.latitude is None
    with pytest.raises(ValueError, match="different event"):
        parse_showstart_detail(
            html, replace(detail_item(), canonical_url="https://www.showstart.com/event/1")
        )


def test_detail_failure_keeps_listing_facts_and_disallows_external_fetch():
    with ShowStartVenueAdapter(user_agent="CityPulse test suite") as adapter:
        adapter.client.close()
        requests = []

        def respond(request):
            requests.append(str(request.url))
            return httpx.Response(404 if request.url.path == "/robots.txt" else 503)

        adapter.client = httpx.Client(transport=httpx.MockTransport(respond))
        result = adapter.enrich(detail_item())
        assert result.starts_at == detail_item().starts_at
        assert result.facts["enrichment"]["detail_status"] == "unavailable"
        with pytest.raises(ValueError, match="canonical"):
            adapter.enrich(replace(detail_item(), canonical_url="http://127.0.0.1/private"))
        assert len(requests) == 2
