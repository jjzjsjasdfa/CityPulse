from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.api.routes.auth import _attempts
from app.core.database import get_session
from app.core.security import hash_password
from app.main import app
from app.models import AuthSession, User, UserRevision, UserRole


@pytest.fixture
def auth_client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(
        engine, tables=[User.__table__, AuthSession.__table__, UserRevision.__table__]
    )
    with Session(engine) as session:
        app.dependency_overrides[get_session] = lambda: session
        _attempts.clear()
        with TestClient(app) as client:
            yield client, session
    app.dependency_overrides.clear()
    engine.dispose()


def test_registration_roles_login_and_revocable_logout(auth_client):
    client, session = auth_client
    credentials = {"email": "Reader@example.com", "password": "a-long-test-password"}
    assert (
        client.post("/api/v1/auth/register", json={**credentials, "role": "admin"}).status_code
        == 422
    )
    response = client.post("/api/v1/auth/register", json=credentials)
    assert response.status_code == 201
    assert response.json()["role"] == "regular"
    assert "password_hash" not in response.text
    assert client.post("/api/v1/auth/register", json=credentials).status_code == 409
    result = client.post("/api/v1/auth/login", json=credentials)
    assert result.status_code == 200
    assert result.headers["cache-control"] == "no-store"
    token = result.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert session.exec(select(AuthSession)).one().token_hash != token
    assert client.get("/api/v1/auth/me", headers=headers).json()["email"] == "reader@example.com"
    assert client.get("/api/v1/admin/candidates", headers=headers).status_code == 403
    assert client.get("/api/v1/admin/candidates").status_code == 401
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401


def test_expired_disabled_and_forged_sessions_are_denied(auth_client):
    client, session = auth_client
    credentials = {"email": "admin@example.com", "password": "a-long-test-password"}
    user = User(
        email=credentials["email"],
        password_hash=hash_password(credentials["password"]),
        role=UserRole.admin,
    )
    session.add(user)
    session.commit()
    assert (
        client.post(
            "/api/v1/auth/login", json={**credentials, "password": "incorrect-password"}
        ).status_code
        == 401
    )
    token = client.post("/api/v1/auth/login", json=credentials).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/auth/me", headers=headers).json()["role"] == "admin"
    user.is_active = False
    session.add(user)
    session.commit()
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    user.is_active = True
    record = session.exec(select(AuthSession)).one()
    record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    session.add(record)
    session.add(user)
    session.commit()
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer forged"})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_validation_does_not_echo_password_and_login_is_throttled(auth_client):
    client, _ = auth_client
    credentials = {"email": "bad", "password": "SECRET"}
    response = client.post("/api/v1/auth/register", json=credentials)
    assert response.status_code == 422
    assert "SECRET" not in response.text
    for _ in range(10):
        response = client.post("/api/v1/auth/login", json=credentials)
    assert response.status_code == 429


def test_admin_user_management_is_audited_and_revokes_sessions(auth_client):
    client, session = auth_client
    admin_password = "a-long-admin-password"
    admin = User(
        email="owner@example.com",
        password_hash=hash_password(admin_password),
        role=UserRole.admin,
    )
    session.add(admin)
    session.commit()
    admin_token = client.post(
        "/api/v1/auth/login",
        json={"email": admin.email, "password": admin_password},
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {admin_token}"}

    assert client.get("/api/v1/admin/users").status_code == 401
    created = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": "Member@example.com",
            "password": "a-temporary-password",
            "role": "regular",
        },
    )
    assert created.status_code == 201, created.text
    user = created.json()
    assert user["email"] == "member@example.com"
    assert "password" not in created.text
    assert (
        client.post(
            "/api/v1/admin/users",
            headers=headers,
            json={
                "email": "member@example.com",
                "password": "another-temporary-password",
                "role": "regular",
            },
        ).status_code
        == 409
    )

    page = client.get(
        "/api/v1/admin/users", headers=headers, params={"q": "member", "active": True}
    ).json()
    assert page["meta"]["total"] == 1
    assert page["data"][0]["id"] == user["id"]
    assert "updated_at" not in page["data"][0]
    assert "updated_at" in client.get(f"/api/v1/admin/users/{user['id']}", headers=headers).json()

    user_token = client.post(
        "/api/v1/auth/login",
        json={"email": "member@example.com", "password": "a-temporary-password"},
    ).json()["access_token"]
    user_headers = {"Authorization": f"Bearer {user_token}"}
    assert (
        client.post(
            f"/api/v1/admin/users/{user['id']}/revoke-sessions", headers=headers
        ).status_code
        == 204
    )
    assert client.get("/api/v1/auth/me", headers=user_headers).status_code == 401

    updated = client.put(
        f"/api/v1/admin/users/{user['id']}",
        headers=headers,
        json={
            "expected_updated_at": user["updated_at"],
            "role": "admin",
            "is_active": True,
            "note": "Promoted for event review coverage",
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["role"] == "admin"
    assert (
        client.put(
            f"/api/v1/admin/users/{user['id']}",
            headers=headers,
            json={
                "expected_updated_at": user["updated_at"],
                "role": "regular",
                "is_active": True,
                "note": "Stale update",
            },
        ).status_code
        == 409
    )

    owner = client.get(f"/api/v1/admin/users/{admin.id}", headers=headers).json()
    assert (
        client.put(
            f"/api/v1/admin/users/{admin.id}",
            headers=headers,
            json={
                "expected_updated_at": owner["updated_at"],
                "role": "regular",
                "is_active": True,
                "note": "Unsafe self demotion",
            },
        ).status_code
        == 409
    )
    revisions = client.get(f"/api/v1/admin/users/{user['id']}/revisions", headers=headers).json()
    assert [row["action"] for row in revisions] == ["updated", "sessions_revoked", "created"]
