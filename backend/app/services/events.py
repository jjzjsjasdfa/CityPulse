from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.security import aware_utc
from app.models import Event, EventCandidate, EventRevision, StatusHistory, User
from app.schemas import AdminEventDetail, AdminEventUpdate, EventFields


def to_admin_event(event: Event) -> AdminEventDetail:
    values = {key: getattr(event, key) for key in EventFields.model_fields if key != "evidence_url"}
    return AdminEventDetail(
        **values,
        evidence_url=event.official_url,
        id=event.id,
        updated_at=event.updated_at,
        is_published=event.is_published,
    )


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
    if event is None or event.is_demo:
        raise HTTPException(404, "Event not found")
    if aware_utc(event.updated_at) != body.expected_updated_at.astimezone(UTC):
        raise HTTPException(409, "Event changed. Reload it before saving.")
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
