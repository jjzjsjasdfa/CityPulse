from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql

from app.core.database import get_session
from app.main import app


class MapSession:
    def __init__(self, rows):
        self.rows = rows
        self.queries = []

    def exec(self, statement):
        self.queries.append(statement.compile(dialect=postgresql.dialect()))
        return SimpleNamespace(all=lambda: self.rows)


def event():
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=uuid4(), name="测试音乐会", category="performance", status="on_sale",
        starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=2),
        latitude=28.2, longitude=112.96, published_at=now - timedelta(days=1),
    )


@pytest.fixture
def map_client():
    session = MapSession([])
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as client:
        yield client, session
    app.dependency_overrides.pop(get_session, None)


def test_province_query_is_not_restricted_to_changsha(map_client):
    client, session = map_client
    response = client.get("/api/v1/events/map", params={
        "west": 108, "east": 118, "south": 22, "north": 34,
    })
    assert response.status_code == 200
    sql = str(session.queries[0]).split("WHERE")[1]
    assert "events.city =" not in sql
    assert "ST_Intersects" in sql
    assert "events.is_demo IS false" in sql
    assert "events.ends_at >" in sql
    assert "ORDER BY events.starts_at, events.id" in sql
    assert response.json()["meta"] == {"count": 0, "has_next": False, "next_offset": None}


def test_map_pagination_exposes_end_time_and_next_offset(map_client):
    client, session = map_client
    session.rows = [event(), event(), event()]
    response = client.get("/api/v1/events/map", params={
        "west": 112, "east": 114, "south": 27, "north": 29, "limit": 2, "offset": 500,
        "category": "performance", "city": "长沙",
    })
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["data"]) == 2
    assert payload["meta"] == {"count": 2, "has_next": True, "next_offset": 502}
    assert "ends_at" in payload["data"][0]
    assert payload["data"][0]["published_at"]
    params = session.queries[0].params
    assert 500 in params.values()
    assert 3 in params.values()  # One lookahead row, rather than truncating at the limit.
    assert "performance" in params.values()
    assert "长沙" in params.values()


@pytest.mark.parametrize("overrides", [
    {"east": 180}, {"north": 70}, {"west": 115}, {"offset": -1}, {"limit": 501},
])
def test_oversized_and_invalid_queries_do_not_reach_database(map_client, overrides):
    client, session = map_client
    response = client.get("/api/v1/events/map", params={
        "west": 112, "east": 114, "south": 27, "north": 29, **overrides,
    })
    assert response.status_code == 422
    assert session.queries == []
