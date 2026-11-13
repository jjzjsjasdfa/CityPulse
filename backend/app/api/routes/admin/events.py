"""Administrator event editing and revision history."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import select

from app.core.security import AdminDep, SessionDep
from app.models import Event, EventRevision
from app.schemas import (
    AdminEventAction,
    AdminEventCreate,
    AdminEventDetail,
    AdminEventPage,
    AdminEventRevision,
    AdminEventSummary,
    AdminEventUpdate,
    OffsetPageMeta,
)
from app.services.events import (
    apply_event_update,
    set_event_archived,
    to_admin_event,
)
from app.services.events import create_event as create_event_record

router = APIRouter(prefix="/admin/events", tags=["admin-events"])


@router.get("", response_model=AdminEventPage)
def list_events(
    session: SessionDep,
    admin: AdminDep,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    q: str = Query("", max_length=200),
    published: bool | None = None,
    archived: bool = False,
):
    archive_condition = Event.archived_at.is_not(None) if archived else Event.archived_at.is_(None)
    conditions = [archive_condition]
    if published is not None:
        conditions.append(Event.is_published == published)
    if q.strip():
        conditions.append(Event.name.icontains(q.strip(), autoescape=True))
    total = session.exec(select(func.count()).select_from(Event).where(*conditions)).one()
    events = session.exec(
        select(Event)
        .where(*conditions)
        .order_by(Event.updated_at.desc(), Event.id)
        .offset(offset)
        .limit(limit)
    ).all()
    return AdminEventPage(
        data=[AdminEventSummary.model_validate(event) for event in events],
        meta=OffsetPageMeta(
            offset=offset,
            limit=limit,
            total=total,
            has_next=offset + len(events) < total,
        ),
    )


@router.post("", response_model=AdminEventDetail, status_code=status.HTTP_201_CREATED)
def create_event(body: AdminEventCreate, session: SessionDep, admin: AdminDep):
    event = create_event_record(session, body, admin)
    session.commit()
    session.refresh(event)
    return to_admin_event(event)


@router.get("/{event_id}", response_model=AdminEventDetail)
def get_event(event_id: UUID, session: SessionDep, admin: AdminDep):
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(404, "Event not found")
    return to_admin_event(event)


@router.put("/{event_id}", response_model=AdminEventDetail)
def update_event(event_id: UUID, body: AdminEventUpdate, session: SessionDep, admin: AdminDep):
    event = apply_event_update(session, event_id, body, admin)
    session.commit()
    session.refresh(event)
    return to_admin_event(event)


@router.post("/{event_id}/archive", response_model=AdminEventDetail)
def archive_event(event_id: UUID, body: AdminEventAction, session: SessionDep, admin: AdminDep):
    event = set_event_archived(session, event_id, body, admin, archived=True)
    session.commit()
    session.refresh(event)
    return to_admin_event(event)


@router.post("/{event_id}/restore", response_model=AdminEventDetail)
def restore_event(event_id: UUID, body: AdminEventAction, session: SessionDep, admin: AdminDep):
    event = set_event_archived(session, event_id, body, admin, archived=False)
    session.commit()
    session.refresh(event)
    return to_admin_event(event)


@router.get("/{event_id}/revisions", response_model=list[AdminEventRevision])
def list_event_revisions(
    event_id: UUID,
    session: SessionDep,
    admin: AdminDep,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    return session.exec(
        select(EventRevision)
        .where(EventRevision.event_id == event_id)
        .order_by(EventRevision.created_at.desc(), EventRevision.id)
        .offset(offset)
        .limit(limit)
    ).all()
