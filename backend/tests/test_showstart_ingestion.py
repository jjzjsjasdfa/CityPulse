from pathlib import Path

from app.ingestion.registry import adapter_keys
from app.ingestion.showstart import ShowStartVenueAdapter, parse_showstart_venue
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
