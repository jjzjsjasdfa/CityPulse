import secrets
import time
from collections import OrderedDict
from datetime import UTC, datetime, timedelta
from threading import Lock
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy import delete
from sqlmodel import select

from app.core.security import (
    SessionDep,
    UserDep,
    current_session,
    hash_password,
    token_hash,
    verify_password,
    bearer,
    aware_utc,
)
from app.models import AuthSession, NicknameChange, User
from fastapi.security import HTTPAuthorizationCredentials
from app.schemas import Credentials, LoginResponse, UserPublic, ProfileUpdate, NicknameChangeInput
from app.schemas import PasswordConfirmation

router = APIRouter(prefix="/auth", tags=["auth"])
_attempts: OrderedDict[str, list[float]] = OrderedDict()
_lock = Lock()
SESSION_LIFETIME = timedelta(days=180)


def rate_limit(request: Request) -> None:
    # Per-process protection; deployments with multiple workers need a shared edge limiter.
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _lock:
        recent = [stamp for stamp in _attempts.pop(key, []) if stamp > now - 60]
        _attempts[key] = recent
        if len(_attempts) > 10000:
            _attempts.popitem(last=False)
        if len(recent) >= 10:
            raise HTTPException(429, "Too many attempts. Try again in one minute.")
        recent.append(now)


@router.post(
    "/register", response_model=UserPublic, status_code=201, dependencies=[Depends(rate_limit)]
)
def register(body: Credentials, session: SessionDep) -> User:
    user = User(email=str(body.email).lower(), password_hash=hash_password(body.password))
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Email is already registered") from None
    session.refresh(user)
    return user


@router.post("/login", response_model=LoginResponse, dependencies=[Depends(rate_limit)])
def login(body: Credentials, session: SessionDep, response: Response) -> LoginResponse:
    user = session.exec(select(User).where(User.email == str(body.email).lower())).first()
    if user is None:
        hash_password(body.password)  # Keep unknown-account timing comparable.
        raise HTTPException(401, "Invalid email or password")
    if not verify_password(body.password, user.password_hash) or not user.is_active:
        raise HTTPException(401, "Invalid email or password")
    token = secrets.token_urlsafe(32)
    expiry = datetime.now(UTC) + SESSION_LIFETIME
    session.add(AuthSession(token_hash=token_hash(token), user_id=user.id, expires_at=expiry))
    session.commit()
    response.headers["Cache-Control"] = "no-store"
    return LoginResponse(
        access_token=token, expires_at=expiry, user=UserPublic.model_validate(user)
    )


@router.get("/me", response_model=UserPublic)
def me(user: UserDep) -> User:
    return user


@router.post('/session', response_model=LoginResponse)
def renew_session(
    session: SessionDep, user: UserDep, response: Response,
    record: Annotated[AuthSession, Depends(current_session)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)],
) -> LoginResponse:
    # Preserve each device's independently revocable session. Concurrent tabs can
    # renew the same credential without invalidating one another.
    record.expires_at = datetime.now(UTC) + SESSION_LIFETIME
    session.add(record)
    session.commit()
    response.headers['Cache-Control'] = 'no-store'
    return LoginResponse(access_token=credentials.credentials,
                         expires_at=aware_utc(record.expires_at), user=UserPublic.model_validate(user))


@router.put('/me', response_model=UserPublic)
def update_profile(body: ProfileUpdate, session: SessionDep, user: UserDep):
    user.avatar = body.avatar
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def public_nickname_change(row):
    return {'id': row.id, 'current_nickname': row.current_nickname,
            'proposed_nickname': row.proposed_nickname, 'status': row.status,
            'review_note': row.review_note, 'created_at': row.created_at,
            'reviewed_at': row.reviewed_at}


@router.get('/nickname-change')
def nickname_change(session: SessionDep, user: UserDep):
    row = session.exec(select(NicknameChange).where(
        NicknameChange.user_id == user.id).order_by(NicknameChange.created_at.desc())).first()
    return public_nickname_change(row) if row else None


@router.post('/nickname-change')
def request_nickname_change(body: NicknameChangeInput, session: SessionDep, user: UserDep):
    if body.nickname == user.nickname:
        raise HTTPException(409, '新昵称与当前昵称相同')
    row = session.exec(select(NicknameChange).where(
        NicknameChange.user_id == user.id, NicknameChange.status == 'pending').with_for_update()).first()
    if row:
        row.current_nickname, row.proposed_nickname = user.nickname, body.nickname
        row.created_at = datetime.now(UTC)
    else:
        row = NicknameChange(user_id=user.id, current_nickname=user.nickname,
                             proposed_nickname=body.nickname)
    session.add(row)
    session.commit()
    session.refresh(row)
    return public_nickname_change(row)


@router.get('/bindings')
def bindings(user: UserDep):
    # Reserve provider discovery without accepting unverified external identities.
    return {'providers': [{'id': 'wechat', 'name': '微信', 'available': False, 'bound': False}]}


@router.post("/logout", status_code=204)
def logout(session: SessionDep, record: Annotated[AuthSession, Depends(current_session)]) -> None:
    session.delete(record)
    session.commit()


@router.post('/logout-others', dependencies=[Depends(rate_limit)])
def logout_others(
    body: PasswordConfirmation, session: SessionDep, user: UserDep,
    record: Annotated[AuthSession, Depends(current_session)],
):
    if not verify_password(body.password, user.password_hash):
        # The session remains valid when password confirmation fails.
        raise HTTPException(400, '密码不正确，请重新输入')
    result = session.execute(delete(AuthSession).where(
        AuthSession.user_id == user.id,
        AuthSession.token_hash != record.token_hash,
    ))
    session.commit()
    return {'revoked_count': result.rowcount}
