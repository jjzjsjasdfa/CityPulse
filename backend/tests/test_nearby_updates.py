from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql

from app.core.database import get_session
from app.main import app


@pytest.fixture
def nearby_client():
    queries = []
    rows = []

    def execute(statement):
        queries.append(statement.compile(dialect=postgresql.dialect()))
        return SimpleNamespace(all=lambda: rows)

    app.dependency_overrides[get_session] = lambda: SimpleNamespace(exec=execute)
    with TestClient(app) as client:
        yield client, queries, rows
    app.dependency_overrides.pop(get_session, None)


def test_radius_and_recent_window_are_filtered_in_postgis(nearby_client):
    client, queries, _ = nearby_client
    response = client.get("/api/v1/events/nearby-updates", params={
        "latitude": 28.2, "longitude": 112.96,
    })
    assert response.status_code == 200
    sql = str(queries[0])
    assert "ST_DWithin" in sql and "geography" in sql.lower()
    assert 15000 in queries[0].params.values()
    assert "ORDER BY events.published_at, events.id" in sql
    assert "events.is_published IS true" in sql
    assert "events.is_demo IS false" in sql
    assert "events.ends_at >" in sql and "events.status NOT IN" in sql
    checked_at = datetime.fromisoformat(response.json()["checked_at"])
    assert checked_at - timedelta(hours=24) in queries[0].params.values()


def test_fixed_upper_bound_and_paging_include_publication_time(nearby_client):
    client, queries, rows = nearby_client
    now = datetime.now(UTC)
    rows.extend(SimpleNamespace(
        id=uuid4(), name="新活动", category="performance", status="announced",
        starts_at=now + timedelta(days=1), ends_at=now + timedelta(days=2),
        published_at=now - timedelta(minutes=5), latitude=28.21, longitude=112.97,
    ) for _ in range(3))
    until = now - timedelta(minutes=1)
    response = client.get("/api/v1/events/nearby-updates", params={
        "latitude": 28.2, "longitude": 112.96, "limit": 2, "offset": 500,
        "since": (now - timedelta(hours=1)).isoformat(), "until": until.isoformat(),
    })
    assert response.status_code == 200
    payload = response.json()
    assert datetime.fromisoformat(payload["checked_at"]) == until
    assert payload["meta"] == {"count": 2, "has_next": True, "next_offset": 502}
    assert all("published_at" in item for item in payload["data"])
    assert until in queries[0].params.values()


@pytest.mark.parametrize("extra", [
    {"radius_km": 16}, {"latitude": 91}, {"longitude": 181}, {"limit": 501},
    {"since": "2026-09-13T12:00:00"},
    {"since": "2026-09-14T12:00:00Z", "until": "2026-09-13T12:00:00Z"},
])
def test_invalid_queries_never_hit_database(nearby_client, extra):
    client, queries, _ = nearby_client
    response = client.get("/api/v1/events/nearby-updates", params={
        "latitude": 28.2, "longitude": 112.96, **extra,
    })
    assert response.status_code == 422
    assert not queries
