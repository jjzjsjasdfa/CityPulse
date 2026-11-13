import os
from dataclasses import replace
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.ingestion.runner import _upsert_item
from app.models import User
from tests.event_review_helpers import edit_body, published
from tests.test_candidate_publication import review_client as review_client

pytestmark = pytest.mark.skipif(
    os.getenv("CITYPULSE_TEST_POSTGRES") != "1", reason="Requires isolated PostGIS integration"
)


def test_admin_edit_cancel_reschedule_unpublish_and_source_conflict(review_client):
    client, session = review_client
    headers, source, item, candidate, event_id = published(client, session)
    path = f"/api/v1/admin/events/{event_id}"
    assert client.get(path).status_code == 401
    body = edit_body(client, event_id, headers, status="cancelled")
    user = session.scalars(select(User)).one()
    user.role = "regular"
    session.commit()
    for url in [path, "/api/v1/admin/events", path + "/revisions", "/api/v1/admin/corrections"]:
        assert client.get(url, headers=headers).status_code == 403
    assert client.put(path, headers=headers, json=body).status_code == 403
    user.role = "admin"
    session.commit()
    assert client.put(path, headers=headers, json=body).status_code == 200
    assert client.get(f"/api/v1/events/{event_id}").json()["data"]["status"] == "cancelled"
    assert client.put(path, headers=headers, json=body).status_code == 409
    body = edit_body(
        client,
        event_id,
        headers,
        status="postponed",
        starts_at=(item.starts_at + timedelta(days=2)).isoformat(),
        ends_at=(item.starts_at + timedelta(days=2, hours=2)).isoformat(),
        latitude=28.3,
        longitude=113.0,
    )
    assert client.put(path, headers=headers, json=body).status_code == 200
    assert client.get(f"/api/v1/events/{event_id}").json()["data"]["status"] == "postponed"
    bounds = {"west": 112.99, "east": 113.01, "south": 28.29, "north": 28.31}
    assert client.get("/api/v1/events/map", params=bounds).json()["data"][0]["id"] == event_id
    body = edit_body(client, event_id, headers, is_published=False)
    assert client.put(path, headers=headers, json=body).status_code == 200
    assert client.get(f"/api/v1/events/{event_id}").status_code == 404
    assert client.get("/api/v1/events").json()["data"] == []
    assert client.get("/api/v1/events/map", params=bounds).json()["data"] == []
    assert (
        client.put(
            path, headers=headers, json=edit_body(client, event_id, headers, is_published=True)
        ).status_code
        == 200
    )
    _upsert_item(session, source, replace(item, price="¥150起"))
    session.commit()
    comparison = client.get(
        f"/api/v1/admin/candidates/{candidate['id']}/comparison", headers=headers
    ).json()
    assert {"field": "price", "before": "¥80起", "after": "¥150起"} in comparison["changes"]
    assert (
        client.put(
            path, headers=headers, json=edit_body(client, event_id, headers, is_published=True)
        ).status_code
        == 409
    )
    rows = client.get(path + "/revisions", headers=headers).json()
    assert len(rows) == 4
    assert rows[0]["actor_id"] == str(user.id)
    assert rows[0]["before"]["is_published"] is False
    assert rows[0]["after"]["is_published"] is True


def test_admin_can_create_archive_and_restore_event(review_client):
    client, session = review_client
    headers, _source, _item, _candidate, event_id = published(client, session)
    body = edit_body(client, event_id, headers, name="管理员创建的活动")
    body.pop("expected_updated_at")
    created = client.post("/api/v1/admin/events", headers=headers, json=body)
    assert created.status_code == 201, created.text
    event = created.json()
    assert event["archived_at"] is None
    assert client.get(f"/api/v1/events/{event['id']}").status_code == 200

    archived = client.post(
        f"/api/v1/admin/events/{event['id']}/archive",
        headers=headers,
        json={"expected_updated_at": event["updated_at"], "note": "Duplicate listing"},
    )
    assert archived.status_code == 200, archived.text
    event = archived.json()
    assert event["archived_at"] is not None
    assert event["is_published"] is False
    assert client.get(f"/api/v1/events/{event['id']}").status_code == 404
    archived_page = client.get(
        "/api/v1/admin/events", headers=headers, params={"archived": True}
    ).json()
    assert event["id"] in [row["id"] for row in archived_page["data"]]
    assert "description" not in archived_page["data"][0]
    assert (
        "description" in client.get(f"/api/v1/admin/events/{event['id']}", headers=headers).json()
    )

    publish_archived = edit_body(
        client, event["id"], headers, is_published=True, review_note="Publish too early"
    )
    assert (
        client.put(
            f"/api/v1/admin/events/{event['id']}", headers=headers, json=publish_archived
        ).status_code
        == 409
    )
    restored = client.post(
        f"/api/v1/admin/events/{event['id']}/restore",
        headers=headers,
        json={"expected_updated_at": event["updated_at"], "note": "Ready for another review"},
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["archived_at"] is None
    assert restored.json()["is_published"] is False
    assert client.get(f"/api/v1/events/{event['id']}").status_code == 404
