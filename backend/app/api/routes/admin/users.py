"""Administrator account management with lockout protection and audit history."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.core.security import AdminDep, SessionDep, aware_utc, hash_password
from app.models import AuthSession, User, UserRevision, UserRole
from app.schemas import (
    AdminUserCreate,
    AdminUserDetail,
    AdminUserPage,
    AdminUserRevision,
    AdminUserSummary,
    AdminUserUpdate,
    OffsetPageMeta,
)

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


def _detail(user: User) -> AdminUserDetail:
    return AdminUserDetail(
        id=user.id,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=aware_utc(user.created_at),
        updated_at=aware_utc(user.updated_at),
    )


def _snapshot(user: User) -> dict:
    return _detail(user).model_dump(mode="json")


def _summary(user: User) -> AdminUserSummary:
    return AdminUserSummary.model_validate(user)


@router.get("", response_model=AdminUserPage)
def list_users(
    session: SessionDep,
    admin: AdminDep,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    q: str = Query("", max_length=320),
    role: UserRole | None = None,
    active: bool | None = None,
):
    conditions = []
    if q.strip():
        conditions.append(User.email.icontains(q.strip(), autoescape=True))
    if role is not None:
        conditions.append(User.role == role)
    if active is not None:
        conditions.append(User.is_active == active)
    total = session.exec(select(func.count()).select_from(User).where(*conditions)).one()
    users = session.exec(
        select(User)
        .where(*conditions)
        .order_by(User.created_at.desc(), User.id)
        .offset(offset)
        .limit(limit)
    ).all()
    return AdminUserPage(
        data=[_summary(user) for user in users],
        meta=OffsetPageMeta(
            offset=offset,
            limit=limit,
            total=total,
            has_next=offset + len(users) < total,
        ),
    )


@router.post("", response_model=AdminUserDetail, status_code=status.HTTP_201_CREATED)
def create_user(body: AdminUserCreate, session: SessionDep, admin: AdminDep):
    now = datetime.now(UTC)
    user = User(
        email=str(body.email).lower(),
        password_hash=hash_password(body.password),
        role=body.role,
        created_at=now,
        updated_at=now,
    )
    session.add(user)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Email is already registered") from None
    session.add(
        UserRevision(
            user_id=user.id,
            actor_id=admin.id,
            action="created",
            note="Administrator created the account.",
            before={},
            after=_snapshot(user),
        )
    )
    session.commit()
    session.refresh(user)
    return _detail(user)


@router.get("/{user_id}", response_model=AdminUserDetail)
def get_user(user_id: UUID, session: SessionDep, admin: AdminDep):
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    return _detail(user)


@router.put("/{user_id}", response_model=AdminUserDetail)
def update_user(user_id: UUID, body: AdminUserUpdate, session: SessionDep, admin: AdminDep):
    active_admins = session.exec(
        select(User)
        .where(User.role == UserRole.admin, User.is_active.is_(True))
        .order_by(User.id)
        .with_for_update()
    ).all()
    user = session.exec(select(User).where(User.id == user_id).with_for_update()).first()
    if user is None:
        raise HTTPException(404, "User not found")
    if aware_utc(user.updated_at) != body.expected_updated_at.astimezone(UTC):
        raise HTTPException(409, "User changed. Reload it before saving.")
    if user.id == admin.id and (body.role != UserRole.admin or not body.is_active):
        raise HTTPException(409, "You cannot remove your own administrator access.")
    removes_active_admin = (
        user.role == UserRole.admin
        and user.is_active
        and (body.role != UserRole.admin or not body.is_active)
    )
    if removes_active_admin and len(active_admins) <= 1:
        raise HTTPException(409, "At least one active administrator is required.")

    before = _snapshot(user)
    now = datetime.now(UTC)
    user.role = body.role
    user.is_active = body.is_active
    user.updated_at = now
    session.add(user)
    if not user.is_active:
        for record in session.exec(select(AuthSession).where(AuthSession.user_id == user.id)).all():
            session.delete(record)
    session.add(
        UserRevision(
            user_id=user.id,
            actor_id=admin.id,
            action="updated",
            note=body.note,
            before=before,
            after=_snapshot(user),
        )
    )
    session.commit()
    session.refresh(user)
    return _detail(user)


@router.post("/{user_id}/revoke-sessions", status_code=status.HTTP_204_NO_CONTENT)
def revoke_sessions(user_id: UUID, session: SessionDep, admin: AdminDep) -> None:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    records = session.exec(select(AuthSession).where(AuthSession.user_id == user.id)).all()
    for record in records:
        session.delete(record)
    session.add(
        UserRevision(
            user_id=user.id,
            actor_id=admin.id,
            action="sessions_revoked",
            note="Administrator revoked all active sessions.",
            before={"active_sessions": len(records)},
            after={"active_sessions": 0},
        )
    )
    session.commit()


@router.get("/{user_id}/revisions", response_model=list[AdminUserRevision])
def list_user_revisions(
    user_id: UUID,
    session: SessionDep,
    admin: AdminDep,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    if session.get(User, user_id) is None:
        raise HTTPException(404, "User not found")
    return session.exec(
        select(UserRevision)
        .where(UserRevision.user_id == user_id)
        .order_by(UserRevision.created_at.desc(), UserRevision.id)
        .offset(offset)
        .limit(limit)
    ).all()
