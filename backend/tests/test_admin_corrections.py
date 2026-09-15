import os
from uuid import UUID

import pytest
from sqlalchemy import select

from app.models import Correction, EventRevision, User
from tests.event_review_helpers import edit_body, published
from tests.test_candidate_publication import review_client as review_client

pytestmark = pytest.mark.skipif(
    os.getenv("CITYPULSE_TEST_POSTGRES") != "1", reason="Requires isolated PostGIS integration"
)


def test_correction_application_is_atomic_private_and_cannot_be_replayed(review_client):
    client, session = review_client
    headers, _, _, _, event_id = published(client, session)
    created = client.post(
        "/api/v1/corrections",
        json={
            "event_id": event_id,
            "kind": "location",
            "message": "Please verify the venue address",
            "contact_email": "private@example.com",
        },
    )
    assert created.status_code == 202
    correction = client.get("/api/v1/admin/corrections", headers=headers).json()[0]
    path = f"/api/v1/admin/corrections/{correction['id']}/review"
    body = {
        "expected_updated_at": correction["updated_at"],
        "status": "accepted",
        "resolution_note": "Verified private@example.com report",
        "event_update": edit_body(client, event_id, headers, address="Corrected venue address"),
    }
    user = session.scalars(select(User)).one()
    user.role = "regular"
    session.commit()
    assert client.post(path, headers=headers, json=body).status_code == 403
    user.role = "admin"
    session.commit()
    assert client.post(path, json=body).status_code == 401
    stale = {
        **body,
        "event_update": {**body["event_update"], "expected_updated_at": "2000-01-01T00:00:00Z"},
    }
    assert client.post(path, headers=headers, json=stale).status_code == 409
    session.expire_all()
    assert session.get(Correction, UUID(correction["id"])).status == "pending"
    assert session.scalars(select(EventRevision)).all() == []
    result = client.post(path, headers=headers, json=body)
    assert result.status_code == 200, result.text
    assert result.json()["status"] == "accepted"
    detail = client.get(f"/api/v1/events/{event_id}")
    assert detail.json()["data"]["location"]["address"] == "Corrected venue address"
    assert "private@example.com" not in detail.text
    assert client.post(path, headers=headers, json=body).status_code == 409
    assert session.scalars(select(EventRevision)).one().correction_id == UUID(correction["id"])
    assert "message" not in created.json()["data"]


def test_correction_reviewing_rejection_and_hidden_event_submission(review_client):
    client, session = review_client
    headers, _, _, _, event_id = published(client, session)
    client.post(
        "/api/v1/corrections",
        json={"event_id": event_id, "kind": "other", "message": "Please verify this information"},
    )
    correction = client.get("/api/v1/admin/corrections", headers=headers).json()[0]
    path = f"/api/v1/admin/corrections/{correction['id']}/review"
    body = {
        "expected_updated_at": correction["updated_at"],
        "status": "reviewing",
        "resolution_note": "Checking the source",
    }
    result = client.post(path, headers=headers, json=body)
    assert result.status_code == 200
    assert (
        client.post(path, headers=headers, json={**body, "status": "rejected"}).status_code == 409
    )
    body.update(expected_updated_at=result.json()["updated_at"], status="rejected")
    assert client.post(path, headers=headers, json=body).status_code == 200
    assert (
        client.get(
            "/api/v1/admin/corrections", headers=headers, params={"status": "rejected"}
        ).json()[0]["status"]
        == "rejected"
    )
    hidden = edit_body(client, event_id, headers, is_published=False)
    client.put(f"/api/v1/admin/events/{event_id}", headers=headers, json=hidden)
    assert (
        client.post(
            "/api/v1/corrections",
            json={"event_id": event_id, "kind": "other", "message": "Hidden event report"},
        ).status_code
        == 404
    )
