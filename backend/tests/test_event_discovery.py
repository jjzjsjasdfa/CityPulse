import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from app.api.routes import events as events_route
from app.models import Event
from tests.event_review_helpers import published
from tests.test_candidate_publication import review_client as review_client

pytestmark = pytest.mark.skipif(
    os.getenv("CITYPULSE_TEST_POSTGRES") != "1", reason="Requires isolated PostGIS integration"
)


def test_discovery_search_pagination_and_shanghai_date_boundaries(review_client, monkeypatch):
    client, session = review_client
    _, _, _, _, event_id = published(client, session)
    # Friday UTC, already Saturday in Changsha. Freeze only the discovery route clock.
    now = datetime(2026, 9, 18, 17, 0, tzinfo=UTC)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz) if tz else now.replace(tzinfo=None)

    monkeypatch.setattr(events_route, "datetime", Clock)
    template = session.get(Event, UUID(event_id))
    template.is_published = False
    for number in range(55):
        values = {
            key: getattr(template, key) for key in Event.model_fields if key not in {"id", "slug"}
        }
        values["location"] = f"SRID=4326;POINT({template.longitude} {template.latitude})"
        values.update(
            name=f"Weekend concert {number:02}",
            is_published=True,
            starts_at=now + timedelta(hours=number),
            ends_at=now + timedelta(hours=number + 1),
            venue_name="100% music hall" if number == 0 else "Concert venue",
        )
        session.add(Event(**values, id=uuid4(), slug=f"search-{number}"))
    session.commit()
    first = client.get("/api/v1/events", params={"page_size": 50, "q": "weekend"}).json()
    second = client.get(
        "/api/v1/events", params={"page_size": 50, "page": 2, "q": "weekend"}
    ).json()
    assert first["meta"]["total"] == 55 and first["meta"]["has_next"]
    assert len(second["data"]) == 5 and not second["meta"]["has_next"]
    assert not ({event["id"] for event in first["data"]} & {e["id"] for e in second["data"]})
    assert client.get("/api/v1/events", params={"q": "%"}).json()["meta"]["total"] == 1
    assert client.get("/api/v1/events", params={"q": "_"}).json()["meta"]["total"] == 0
    today = client.get("/api/v1/events", params={"when": "today", "page_size": 100}).json()
    weekend = client.get("/api/v1/events", params={"when": "weekend", "page_size": 100}).json()
    assert today["meta"]["total"] == 23
    assert weekend["meta"]["total"] == 47
    assert (
        client.get(
            "/api/v1/events", params={"date_from": "2026-09-20", "date_to": "2026-09-19"}
        ).status_code
        == 422
    )
