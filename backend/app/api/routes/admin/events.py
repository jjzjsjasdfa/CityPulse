"""Administrator event editing and revision history."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.core.security import AdminDep, SessionDep
from app.models import Event, EventRevision
from app.schemas import AdminEventDetail, AdminEventRevision, AdminEventUpdate
from app.services.events import apply_event_update, to_admin_event

router = APIRouter(prefix="/admin/events", tags=["admin-events"])


@router.get("", response_model=list[AdminEventDetail])
def list_events(
    session: SessionDep,
    admin: AdminDep,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    q: str = Query("", max_length=200),
    published: bool | None = None,
):
    conditions = [Event.is_demo.is_(False)]
    if published is not None:
        conditions.append(Event.is_published == published)
    if q.strip():
        conditions.append(Event.name.icontains(q.strip(), autoescape=True))
    return [
        to_admin_event(event)
        for event in session.exec(
            select(Event)
            .where(*conditions)
            .order_by(Event.updated_at.desc(), Event.id)
            .offset(offset)
            .limit(limit)
        ).all()
    ]


@router.get("/{event_id}", response_model=AdminEventDetail)
def get_event(event_id: UUID, session: SessionDep, admin: AdminDep):
    event = session.get(Event, event_id)
    if event is None or event.is_demo:
        raise HTTPException(404, "Event not found")
    return to_admin_event(event)


@router.put("/{event_id}", response_model=AdminEventDetail)
def update_event(event_id: UUID, body: AdminEventUpdate, session: SessionDep, admin: AdminDep):
    event = apply_event_update(session, event_id, body, admin)
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
