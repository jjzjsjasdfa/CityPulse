import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_points_to_docs_and_health() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["docs"] == "/docs"


def test_categories_are_localized() -> None:
    response = client.get("/api/v1/meta/categories")
    assert response.status_code == 200
    values = {item["value"]: item["label"] for item in response.json()["data"]}
    assert values["performance"] == "演出"
    assert values["sports"] == "体育"


def test_invalid_bbox_uses_shared_error_envelope() -> None:
    response = client.get(
        "/api/v1/events/map",
        params={"west": 113, "south": 28, "east": 112, "north": 29},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "http_422"


def test_checked_in_openapi_contract_is_current() -> None:
    snapshot = Path(__file__).resolve().parents[2] / "mobile" / "openapi.json"
    assert json.loads(snapshot.read_text(encoding="utf-8")) == app.openapi()
