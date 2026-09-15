"""Run with CITYPULSE_TEST_POSTGRES=1 against local PostGIS; uses an isolated schema."""

import os
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select

from app.api.routes.auth import _attempts
from app.core.config import settings
from app.core.database import get_session
from app.core.security import hash_password
from app.ingestion.runner import _upsert_item
from app.ingestion.showstart import ShowStartVenueAdapter
from app.ingestion.types import IngestionItem
from app.main import app
from app.models import (
    Event,
    EventCandidate,
    EventSourceLink,
    Source,
    SourceLevel,
    StatusHistory,
    User,
)

pytestmark = pytest.mark.skipif(
    os.getenv("CITYPULSE_TEST_POSTGRES") != "1",
    reason="Set CITYPULSE_TEST_POSTGRES=1 for PostGIS integration",
)


@pytest.fixture
def review_client():
    engine = create_engine(settings.database_url)
    schema = "test_review_" + uuid4().hex
    with engine.connect() as connection:
        transaction = connection.begin()
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
        scoped = connection.execution_options(schema_translate_map={None: schema})
        SQLModel.metadata.create_all(scoped)
        with Session(scoped, join_transaction_mode="create_savepoint") as session:
            app.dependency_overrides[get_session] = lambda: session
            _attempts.clear()
            with TestClient(app) as client:
                yield client, session
        app.dependency_overrides.clear()
        transaction.rollback()  # Removes only this test's schema and records.
    engine.dispose()


def setup_review(client, session):
    password = "test-review-password"
    admin = User(email="admin@example.com", password_hash=hash_password(password), role="admin")
    session.add(admin)
    source = Source(
        name="Showstart",
        url="https://www.showstart.com/venue/1344034",
        level=SourceLevel.lead,
        reliability_score=0.7,
    )
    session.add(source)
    session.flush()
    item = IngestionItem(
        title="Integration concert",
        canonical_url="https://www.showstart.com/event/100001",
        category="performance",
        starts_at=datetime.now(UTC) + timedelta(days=3),
        city="长沙",
        venue_name="长沙音乐厅",
        price="¥80起",
    )
    _upsert_item(session, source, item)
    session.commit()
    token = client.post(
        "/api/v1/auth/login", json={"email": admin.email, "password": password}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, source, item


def approval(candidate):
    return {
        "expected_updated_at": candidate["updated_at"],
        "name": candidate["name"],
        "category": "performance",
        "summary": "Integration review summary",
        "description": "Integration review description",
        "starts_at": candidate["starts_at"],
        "ends_at": (
            datetime.fromisoformat(candidate["starts_at"]) + timedelta(hours=2)
        ).isoformat(),
        "venue_name": "长沙音乐厅",
        "address": "Integration test address",
        "city": "长沙",
        "district": "开福区",
        "latitude": 28.25,
        "longitude": 112.98,
        "organizer": "Integration organizer",
        "status": "on_sale",
        "price": candidate["price"],
        "evidence_url": candidate["official_url"],
        "review_note": "Verified in integration test",
    }


def test_approval_publication_reimport_rejection_and_no_duplicates(review_client):
    client, session = review_client
    headers, source, item = setup_review(client, session)
    candidate = client.get("/api/v1/admin/candidates", headers=headers).json()[0]
    path = f"/api/v1/admin/candidates/{candidate['id']}"
    assert client.get("/api/v1/events").json()["data"] == []
    body = approval(candidate)
    assert client.post(path + "/approve", json=body).status_code == 401
    user = session.exec(select(User)).one()
    user.role = "regular"
    session.add(user)
    session.commit()
    assert client.post(path + "/approve", json=body, headers=headers).status_code == 403
    assert (
        client.post(
            path + "/reject",
            json={
                "expected_updated_at": candidate["updated_at"],
                "review_note": "Unauthorized decision",
            },
            headers=headers,
        ).status_code
        == 403
    )
    user.role = "admin"
    session.add(user)
    session.commit()
    invalid = {**body, "ends_at": body["starts_at"]}
    assert client.post(path + "/approve", json=invalid, headers=headers).status_code == 422
    response = client.post(path + "/approve", json=body, headers=headers)
    assert response.status_code == 200, response.text
    event_id = response.json()["event_id"]
    assert client.get("/api/v1/events").json()["data"][0]["id"] == event_id
    detail = client.get(f"/api/v1/events/{event_id}").json()["data"]
    assert detail["sources"][0]["evidence_url"] == item.canonical_url
    assert detail["sources"][0]["is_official"] is False
    assert detail["price"] == "¥80起" and detail["is_demo"] is False
    assert len(detail["status_history"]) == 1
    bounds = {"west": 112.9, "east": 113.1, "south": 28.1, "north": 28.4}
    assert client.get("/api/v1/events/map", params=bounds).json()["data"][0]["id"] == event_id
    assert client.post(path + "/approve", json=body, headers=headers).status_code == 409
    _upsert_item(session, source, item)
    session.commit()
    assert session.exec(select(EventCandidate)).one().review_status == "approved"
    changed = IngestionItem(**{**item.__dict__, "price": "¥100起"})
    _upsert_item(session, source, changed)
    session.commit()
    assert client.get(f"/api/v1/events/{event_id}").status_code == 404
    assert client.get("/api/v1/events/map", params=bounds).json()["data"] == []
    assert client.post(path + "/approve", json=body, headers=headers).status_code == 409
    updated = client.get("/api/v1/admin/candidates", headers=headers).json()[0]
    response = client.post(path + "/approve", json=approval(updated), headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["event_id"] == event_id
    assert len(session.exec(select(Event)).all()) == 1
    assert len(session.exec(select(EventSourceLink)).all()) == 1
    assert len(session.exec(select(StatusHistory)).all()) == 2
    changed = IngestionItem(**{**item.__dict__, "price": "¥120起"})
    _upsert_item(session, source, changed)
    session.commit()
    updated = client.get("/api/v1/admin/candidates", headers=headers).json()[0]
    rejection = {"expected_updated_at": updated["updated_at"], "review_note": "Incorrect listing"}
    assert client.post(path + "/reject", json=rejection, headers=headers).status_code == 200
    assert client.get("/api/v1/events").json()["data"] == []
    assert client.get(f"/api/v1/events/{event_id}").status_code == 404
    assert client.post(path + "/reject", json=rejection, headers=headers).status_code == 409


def test_initial_rejection_never_creates_a_public_event(review_client):
    client, session = review_client
    headers, _, _ = setup_review(client, session)
    candidate = client.get("/api/v1/admin/candidates", headers=headers).json()[0]
    path = f"/api/v1/admin/candidates/{candidate['id']}/reject"
    response = client.post(
        path,
        headers=headers,
        json={
            "expected_updated_at": candidate["updated_at"],
            "review_note": "Cannot verify source",
        },
    )
    assert response.status_code == 200
    assert response.json()["event_id"] is None
    assert response.json()["reviewed_by"] is not None
    assert len(session.exec(select(Event)).all()) == 0


def test_approved_past_events_are_discoverable_without_exposing_unpublished_events(review_client):
    client, session = review_client
    headers, source, item = setup_review(client, session)
    event_ids = []
    for number, days in enumerate([3, -10, -3]):
        if number:
            _upsert_item(session, source, replace(
                item,
                canonical_url=f"https://www.showstart.com/event/{200000 + number}",
                starts_at=datetime.now(UTC) + timedelta(days=days),
            ))
            session.commit()
        candidate = client.get("/api/v1/admin/candidates", headers=headers).json()[0]
        response = client.post(
            f"/api/v1/admin/candidates/{candidate['id']}/approve",
            json=approval(candidate), headers=headers,
        )
        assert response.status_code == 200, response.text
        event_ids.append(response.json()["event_id"])

    def past():
        return client.get("/api/v1/events", params={"time_scope": "past"}).json()

    assert [event["id"] for event in client.get("/api/v1/events").json()["data"]] == event_ids[:1]
    assert [event["id"] for event in past()["data"]] == event_ids[:0:-1]
    assert past()["meta"]["total"] == 2
    assert client.get(f"/api/v1/events/{event_ids[1]}").status_code == 200
    event = session.get(Event, event_ids[1])
    event.is_published = False
    session.add(event)
    event = session.get(Event, event_ids[2])
    event.is_demo = True
    session.add(event)
    session.commit()
    assert past()["data"] == []
    assert past()["meta"]["total"] == 0


def test_enrichment_is_admin_only_persists_fields_and_invalidates_stale_forms(
    review_client, monkeypatch
):
    client, session = review_client
    headers, _, _ = setup_review(client, session)
    monkeypatch.setattr(settings, "ingestion_user_agent", "CityPulse integration tests")
    monkeypatch.setattr(
        ShowStartVenueAdapter,
        "enrich",
        lambda self, item: replace(
            item,
            address="长沙市开福区滨江文化园",
            district="开福区",
            longitude=112.973186,
            latitude=28.2461807,
            ends_at=item.starts_at + timedelta(hours=2),
            facts={"enrichment": {"detail_status": "ok", "location_method": "showstart"}},
        ),
    )
    candidate = client.get("/api/v1/admin/candidates", headers=headers).json()[0]
    path = f"/api/v1/admin/candidates/{candidate['id']}/enrich"
    body = {"expected_updated_at": candidate["updated_at"]}
    assert client.post(path, json=body).status_code == 401
    user = session.exec(select(User)).one()
    user.role = "regular"
    session.add(user)
    session.commit()
    assert client.post(path, json=body, headers=headers).status_code == 403
    user.role = "admin"
    session.add(user)
    session.commit()
    response = client.post(path, json=body, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["latitude"] == 28.2461807
    assert response.json()["enrichment"]["location_method"] == "showstart"
    assert response.json()["review_status"] == "pending"
    assert client.get("/api/v1/events").json()["data"] == []
    assert client.post(path, json=body, headers=headers).status_code == 409


def test_transient_detail_failure_preserves_enrichment_and_publication(review_client):
    client, session = review_client
    headers, source, listing = setup_review(client, session)
    complete = replace(
        listing,
        address="长沙市开福区滨江文化园",
        district="开福区",
        latitude=28.2461807,
        longitude=112.973186,
        ends_at=listing.starts_at + timedelta(hours=2),
        facts={"enrichment": {"detail_status": "ok"}},
    )
    _upsert_item(session, source, complete)
    session.commit()
    candidate = client.get("/api/v1/admin/candidates", headers=headers).json()[0]
    path = f"/api/v1/admin/candidates/{candidate['id']}/approve"
    assert client.post(path, json=approval(candidate), headers=headers).status_code == 200
    failure = replace(listing, facts={"enrichment": {"detail_status": "unavailable"}})
    assert _upsert_item(session, source, failure) == (False, False)
    session.commit()
    record = session.exec(select(EventCandidate)).one()
    assert record.review_status == "approved"
    assert record.latitude == complete.latitude
    assert record.ends_at == complete.ends_at
    assert len(client.get("/api/v1/events").json()["data"]) == 1
