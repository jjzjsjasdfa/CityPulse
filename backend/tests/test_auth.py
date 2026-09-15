from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.api.routes.auth import _attempts
from app.core.database import get_session
from app.core.security import hash_password
from app.main import app
from app.models import AuthSession, User, UserRole


@pytest.fixture
def auth_client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine, tables=[User.__table__, AuthSession.__table__])
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


def test_demo_requires_active_administrator(auth_client):
    from app.demo import app as demo_app
    client, session = auth_client
    demo_app.dependency_overrides[get_session] = lambda: session
    try:
        demo = TestClient(demo_app)
        assert demo.get('/api/v1/demo/dataset').status_code == 401
        credentials = {'email': 'debug@example.com', 'password': 'long-debug-password'}
        client.post('/api/v1/auth/register', json=credentials)
        token = client.post('/api/v1/auth/login', json=credentials).json()['access_token']
        headers = {'Authorization': f'Bearer {token}'}
        assert demo.post('/api/v1/demo/publish', headers=headers).status_code == 403
        user = session.exec(select(User)).one()
        user.role = UserRole.admin
        session.add(user)
        session.commit()
        assert demo.get('/api/v1/demo/dataset', headers=headers).status_code == 200
        client.post('/api/v1/auth/logout', headers=headers)
        assert demo.get('/api/v1/demo/dataset', headers=headers).status_code == 401
    finally:
        demo_app.dependency_overrides.clear()


def test_promote_existing_account_preserves_password(auth_client, monkeypatch):
    import sys
    from app import manage_users
    _, session = auth_client
    user = User(email='existing@example.com', password_hash='unchanged-password-hash')
    session.add(user)
    session.commit()
    monkeypatch.setattr(manage_users, 'engine', session.get_bind())
    monkeypatch.setattr(sys, 'argv', ['manage_users', 'existing@example.com', '--promote'])
    manage_users.main()
    session.refresh(user)
    assert user.role == UserRole.admin
    assert user.password_hash == 'unchanged-password-hash'
