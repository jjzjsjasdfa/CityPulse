from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.api.routes.auth import _attempts
from app.core.database import get_session
from app.core.security import hash_password
from app.main import app
from app.models import AuthSession, NicknameChange, User, UserRole


@pytest.fixture
def auth_client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine, tables=[User.__table__, AuthSession.__table__, NicknameChange.__table__])
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


def test_profile_is_account_owned_and_nickname_requires_admin_review(auth_client):
    client, session = auth_client
    credentials = {'email':'profile@example.com','password':'test-profile-password'}
    client.post('/api/v1/auth/register',json=credentials)
    headers={'Authorization':'Bearer '+client.post('/api/v1/auth/login',json=credentials).json()['access_token']}
    assert client.put('/api/v1/auth/me',json={'avatar':'leaf'}).status_code==401
    assert client.put('/api/v1/auth/me',headers=headers,json={'avatar':'leaf','role':'admin'}).status_code==422
    response=client.put('/api/v1/auth/me',headers=headers,json={'avatar':'music'})
    assert response.status_code==200
    assert response.json()['nickname']=='' and response.json()['role']=='regular'
    assert client.get('/api/v1/auth/me',headers=headers).json()['avatar']=='music'
    request=client.post('/api/v1/auth/nickname-change',headers=headers,json={'nickname':'新的昵称'})
    assert request.status_code==200 and request.json()['status']=='pending'
    assert client.get('/api/v1/auth/me',headers=headers).json()['nickname']==''
    request_id=request.json()['id']
    assert client.post('/api/v1/auth/nickname-change',headers=headers,json={'nickname':'更新后的昵称'}).json()['id']==request_id
    admin=User(email='profile-admin@example.com',password_hash=hash_password('test-profile-password'),role=UserRole.admin)
    session.add(admin);session.commit()
    admin_headers={'Authorization':'Bearer '+client.post('/api/v1/auth/login',json={'email':admin.email,'password':'test-profile-password'}).json()['access_token']}
    assert client.get('/api/v1/admin/nickname-changes',headers=headers).status_code==403
    queue=client.get('/api/v1/admin/nickname-changes',headers=admin_headers).json()
    assert queue[0]['proposed_nickname']=='更新后的昵称'
    reviewed=client.post(f'/api/v1/admin/nickname-changes/{request_id}/review',headers=admin_headers,json={'approve':True,'note':'昵称合规'})
    assert reviewed.status_code==200 and reviewed.json()['status']=='approved'
    assert client.get('/api/v1/auth/me',headers=headers).json()['nickname']=='更新后的昵称'
    assert client.post(f'/api/v1/admin/nickname-changes/{request_id}/review',headers=admin_headers,json={'approve':True,'note':'重复'}).status_code==409
    assert client.get('/api/v1/auth/bindings').status_code==401
    assert client.get('/api/v1/auth/bindings',headers=headers).json()['providers'][0]['available'] is False


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
