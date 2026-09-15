from collections import Counter
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi.testclient import TestClient

from app.demo import app, distance
from app.demo_data import build_dataset
from scripts.seed_demo import database_events


def test_debug_clock_filters_without_changing_the_server_clock():
    client = TestClient(app)
    data = client.get("/api/v1/demo/dataset").json()
    anchor = datetime.fromisoformat(data["anchor"])
    args = {"west": 112, "east": 114, "south": 27, "north": 29}
    current = client.get("/api/v1/events/map", params=args | {"demo_now": anchor.isoformat()})
    future = client.get(
        "/api/v1/events/map", params=args | {"demo_now": (anchor + timedelta(days=365)).isoformat()}
    )
    assert current.status_code == future.status_code == 200
    assert current.json()["data"] and not future.json()["data"]
    again = client.get("/api/v1/events/map", params=args | {"demo_now": anchor.isoformat()})
    assert again.json() == current.json()
    assert (
        client.get(
            "/api/v1/events/map", params=args | {"demo_now": "2026-09-14T12:00:00"}
        ).status_code
        == 422
    )


def test_postgis_import_mapping_retains_contract_without_database_access():
    data = build_dataset()
    rows = database_events(data)
    assert len(rows) == 200
    for row, fixture in zip(rows, data["events"], strict=True):
        assert str(row.id) == fixture["id"]
        assert row.is_demo and row.is_published
        assert row.location.srid == 4326
        assert row.latitude == fixture["location"]["latitude"]
        assert row.traits == fixture["attributes"]


def test_fixture_counts_time_buckets_density_and_stable_ids():
    data = build_dataset(datetime(2026, 9, 13, tzinfo=UTC))
    rows = data["events"]
    assert len({(e['location']['latitude'], e['location']['longitude']) for e in rows[:12]}) == 1
    assert rows[0]['starts_at'] == rows[6]['starts_at']
    assert rows[0]['starts_at'] != rows[1]['starts_at']
    assert len(rows) == len({e["id"] for e in rows}) == 200
    assert Counter(e["attributes"][1] for e in rows) == data["groups"]
    sizes = Counter(e["attributes"][2] for e in rows)
    assert len(sizes) == 6 and max(sizes.values()) - min(sizes.values()) == 1
    assert len([e for e in rows[:100] if distance(**data["location"], event=e) < 2]) >= 15
    assert len([e for e in rows[:100] if distance(**data["location"], event=e) > 20]) >= 35
    for row in rows:
        UUID(row["id"])
        assert row["is_demo"] and row["location"]["latitude"] and row["location"]["longitude"]
    assert [e["id"] for e in build_dataset()["events"]] == [e["id"] for e in rows]
    for i in range(80, 88):
        assert rows[i]["category"] != rows[i + 8]["category"]


def test_demo_preserves_production_read_contract_and_filters():
    client = TestClient(app)
    data = client.get("/api/v1/demo/dataset").json()
    assert len(data["events"]) == 200
    listing = client.get("/api/v1/events", params={"city": "长沙", "page_size": 100}).json()
    assert listing["meta"]["total"] == len(listing["data"]) == 100
    first = listing["data"][0]
    assert client.get(f"/api/v1/events/{first['id']}").json()["data"]["is_demo"]
    params = {"west": 112, "east": 114, "south": 27, "north": 30, "limit": 7}
    result = client.get("/api/v1/events/map", params=params).json()
    assert len(result["data"]) == 7 and result["meta"]["next_offset"] == 7
    assert all(112 <= e["longitude"] <= 114 for e in result["data"])
    filtered = client.get("/api/v1/events/map", params=params | {"category": "sports"}).json()
    assert all(e["category"] == "sports" for e in filtered["data"])


def test_new_publication_reuses_200_rows_and_respects_radius_and_watermark():
    client = TestClient(app)
    origin = client.get("/api/v1/demo").json()["location"]
    before = datetime.now(UTC) - timedelta(seconds=1)
    assert client.post("/api/v1/demo/publish").json()["published"] == 16
    response = client.get(
        "/api/v1/events/nearby-updates", params=origin | {"since": before.isoformat()}
    )
    assert response.status_code == 200
    rows = response.json()["data"]
    assert len(rows) == 16
    assert all(distance(**origin, event={"location": e}) < 15 for e in rows)
    assert client.get("/health").json()["count"] == 200
    assert client.get(
        "/api/v1/events/nearby-updates", params=origin | {"radius_km": 30}
    ).status_code == 200
    assert (
        client.get("/api/v1/events/nearby-updates", params=origin | {"radius_km": 31}).status_code
        == 422
    )
