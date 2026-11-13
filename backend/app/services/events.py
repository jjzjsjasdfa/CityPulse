from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.security import aware_utc
from app.models import Event, EventCandidate, EventRevision, StatusHistory, User
from app.schemas import (
    AdminEventAction,
    AdminEventCreate,
    AdminEventDetail,
    AdminEventUpdate,
    EventFields,
)


def to_admin_event(event: Event) -> AdminEventDetail:
    values = {key: getattr(event, key) for key in EventFields.model_fields if key != "evidence_url"}
    return AdminEventDetail(
        **values,
        evidence_url=event.official_url,
        id=event.id,
        updated_at=event.updated_at,
        is_published=event.is_published,
        archived_at=event.archived_at,
    )


def create_event(session: Session, body: AdminEventCreate, admin: User) -> Event:
    """Create and audit a manually entered event."""
    now = datetime.now(UTC)
    event_id = uuid4()
    values = body.model_dump(exclude={"review_note", "evidence_url"})
    event = Event(
        **values,
        id=event_id,
        slug=f"manual-{event_id}",
        official_url=str(body.evidence_url),
        location=f"SRID=4326;POINT({body.longitude} {body.latitude})",
        last_verified_at=now,
        confidence=1,
        published_at=now,
        created_at=now,
        updated_at=now,
    )
    session.add(event)
    session.flush()
    session.add(
        EventRevision(
            event_id=event.id,
            actor_id=admin.id,
            note=body.review_note,
            before={},
            after=to_admin_event(event).model_dump(mode="json"),
        )
    )
    session.add(
        StatusHistory(
            event_id=event.id,
            status=event.status,
            changed_at=now,
            note="管理员已创建并核实活动信息。",
        )
    )
    session.flush()
    return event


def apply_event_update(
    session: Session,
    event_id: UUID,
    body: AdminEventUpdate,
    admin: User,
    correction_id: UUID | None = None,
) -> Event:
    """Apply and audit an edit; flush only so callers can commit related changes atomically."""
    # Same candidate -> event lock ordering as approval and ingestion.
    candidate = session.exec(
        select(EventCandidate).where(EventCandidate.event_id == event_id).with_for_update()
    ).first()
    event = session.exec(select(Event).where(Event.id == event_id).with_for_update()).first()
    if event is None:
        raise HTTPException(404, "Event not found")
    if aware_utc(event.updated_at) != body.expected_updated_at.astimezone(UTC):
        raise HTTPException(409, "Event changed. Reload it before saving.")
    if event.archived_at is not None and body.is_published:
        raise HTTPException(409, "Restore the archived event before publishing it.")
    if body.is_published and candidate and candidate.review_status != "approved":
        raise HTTPException(409, "Source changes need candidate approval before republication.")
    before = to_admin_event(event).model_dump(mode="json")
    now = datetime.now(UTC)
    values = body.model_dump(exclude={"expected_updated_at", "review_note", "evidence_url"})
    values.update(
        official_url=str(body.evidence_url),
        location=f"SRID=4326;POINT({body.longitude} {body.latitude})",
        updated_at=now,
        last_verified_at=now,
    )
    if body.is_published and not event.is_published:
        values["published_at"] = now
    for key, value in values.items():
        setattr(event, key, value)
    session.add(event)
    session.add(
        EventRevision(
            event_id=event.id,
            actor_id=admin.id,
            correction_id=correction_id,
            note=body.review_note,
            before=before,
            after=to_admin_event(event).model_dump(mode="json"),
        )
    )
    # Internal reviewer notes may contain correction contact details; only a neutral
    # description of the change belongs in the public event timeline.
    session.add(
        StatusHistory(
            event_id=event.id,
            status=event.status,
            changed_at=now,
            note="管理员已核实并更新活动信息。",
        )
    )
    session.flush()
    return event


def set_event_archived(
    session: Session,
    event_id: UUID,
    body: AdminEventAction,
    admin: User,
    *,
    archived: bool,
) -> Event:
    """Archive or restore an event without erasing its evidence and audit history."""
    session.exec(
        select(EventCandidate).where(EventCandidate.event_id == event_id).with_for_update()
    ).first()
    event = session.exec(select(Event).where(Event.id == event_id).with_for_update()).first()
    if event is None:
        raise HTTPException(404, "Event not found")
    if aware_utc(event.updated_at) != body.expected_updated_at.astimezone(UTC):
        raise HTTPException(409, "Event changed. Reload it before saving.")
    if (event.archived_at is not None) == archived:
        raise HTTPException(409, "Event is already in the requested archive state.")

    before = to_admin_event(event).model_dump(mode="json")
    now = datetime.now(UTC)
    event.archived_at = now if archived else None
    event.is_published = False
    event.updated_at = now
    session.add(event)
    session.add(
        EventRevision(
            event_id=event.id,
            actor_id=admin.id,
            note=body.note,
            before=before,
            after=to_admin_event(event).model_dump(mode="json"),
        )
    )
    session.flush()
    return event
