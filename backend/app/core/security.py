import hashlib
import secrets
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.core.database import get_session
from app.models import AuthSession, User, UserRole

bearer = HTTPBearer(auto_error=False)
SessionDep = Annotated[Session, Depends(get_session)]


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(
        password.encode(),
        salt=bytes.fromhex(salt),
        n=131072,
        r=8,
        p=1,
        maxmem=268435456,
    ).hex()
    return f"scrypt${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, _ = stored.split("$")
        return secrets.compare_digest(hash_password(password, salt), stored)
    except ValueError:
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def aware_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def current_session(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> AuthSession:
    record = session.get(AuthSession, token_hash(credentials.credentials)) if credentials else None
    if record is None or aware_utc(record.expires_at) <= datetime.now(UTC):
        raise HTTPException(401, "Please sign in again", headers={"WWW-Authenticate": "Bearer"})
    return record


def current_user(
    session: SessionDep,
    record: Annotated[AuthSession, Depends(current_session)],
) -> User:
    user = session.get(User, record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(401, "Account unavailable")
    return user


UserDep = Annotated[User, Depends(current_user)]


def require_admin(user: UserDep) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(403, "Administrator access required")
    return user


AdminDep = Annotated[User, Depends(require_admin)]
