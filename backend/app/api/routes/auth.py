import secrets
import time
from collections import OrderedDict
from datetime import UTC, datetime, timedelta
from threading import Lock
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.core.security import (
    SessionDep,
    UserDep,
    current_session,
    hash_password,
    token_hash,
    verify_password,
)
from app.models import AuthSession, User
from app.schemas import Credentials, LoginResponse, UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])
_attempts: OrderedDict[str, list[float]] = OrderedDict()
_lock = Lock()


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
    expiry = datetime.now(UTC) + timedelta(hours=12)
    session.add(AuthSession(token_hash=token_hash(token), user_id=user.id, expires_at=expiry))
    session.commit()
    response.headers["Cache-Control"] = "no-store"
    return LoginResponse(
        access_token=token, expires_at=expiry, user=UserPublic.model_validate(user)
    )


@router.get("/me", response_model=UserPublic)
def me(user: UserDep) -> User:
    return user


@router.post("/logout", status_code=204)
def logout(session: SessionDep, record: Annotated[AuthSession, Depends(current_session)]) -> None:
    session.delete(record)
    session.commit()
