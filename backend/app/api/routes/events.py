from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2 import Geometry
from sqlalchemy import cast, func
from sqlmodel import Session, select

from app.core.database import get_session
from app.models import Event, EventCategory, EventSourceLink, Source, StatusHistory
from app.schemas import (
    EventDetail,
    EventDetailResponse,
    EventPage,
    EventSummary,
    Location,
    MapEvent,
    MapEventsResponse,
    PageMeta,
    SourceEvidence,
    StatusHistoryPublic,
)

router = APIRouter(prefix="/events", tags=["events"])
SessionDep = Annotated[Session, Depends(get_session)]


def _is_new(event: Event, now: datetime) -> bool:
    return event.published_at >= now - timedelta(days=7)


def _is_ending_soon(event: Event, now: datetime) -> bool:
    return now <= event.ends_at <= now + timedelta(days=7)


def _summary(event: Event, now: datetime | None = None) -> EventSummary:
    current = now or datetime.now(UTC)
    return EventSummary(
        id=event.id,
        slug=event.slug,
        name=event.name,
        category=event.category,
        summary=event.summary,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        location=Location(
            venue_name=event.venue_name,
            address=event.address,
            city=event.city,
            district=event.district,
            latitude=event.latitude,
            longitude=event.longitude,
        ),
        organizer=event.organizer,
        price=event.price,
        status=event.status,
        last_verified_at=event.last_verified_at,
        confidence=event.confidence,
        attributes=event.traits,
        is_ad=event.is_ad,
        is_demo=event.is_demo,
        is_new=_is_new(event, current),
        is_ending_soon=_is_ending_soon(event, current),
    )


def _date_start(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=UTC)


def _date_end(value: date) -> datetime:
    return datetime.combine(value, time.max, tzinfo=UTC)


@router.get("", response_model=EventPage)
def list_events(
    session: SessionDep,
    city: str = Query(default="长沙", min_length=1, max_length=80),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    date_from: date | None = None,
    date_to: date | None = None,
    category: EventCategory | None = None,
    attribute: str | None = Query(default=None, max_length=60),
    sort: Literal["newest", "soonest", "ending_soon"] = "soonest",
) -> EventPage:
    now = datetime.now(UTC)
    conditions = [Event.is_published.is_(True), Event.city == city, Event.ends_at >= now]
    if date_from:
        conditions.append(Event.ends_at >= _date_start(date_from))
    if date_to:
        conditions.append(Event.starts_at <= _date_end(date_to))
    if category:
        conditions.append(Event.category == category)
    if attribute:
        conditions.append(Event.traits.contains([attribute]))
    if sort == "ending_soon":
        conditions.append(Event.ends_at <= now + timedelta(days=7))

    total = session.exec(select(func.count()).select_from(Event).where(*conditions)).one()
    order = Event.published_at.desc() if sort == "newest" else Event.starts_at.asc()
    events = session.exec(
        select(Event)
        .where(*conditions)
        .order_by(order)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return EventPage(
        data=[_summary(event, now) for event in events],
        meta=PageMeta(
            page=page,
            page_size=page_size,
            total=total,
            has_next=page * page_size < total,
        ),
    )


@router.get("/map", response_model=MapEventsResponse)
def map_events(
    session: SessionDep,
    west: float = Query(ge=-180, le=180),
    south: float = Query(ge=-90, le=90),
    east: float = Query(ge=-180, le=180),
    north: float = Query(ge=-90, le=90),
    city: str = Query(default="长沙", min_length=1, max_length=80),
    date_from: date | None = None,
    date_to: date | None = None,
    category: EventCategory | None = None,
) -> MapEventsResponse:
    if west >= east or south >= north:
        raise HTTPException(status_code=422, detail="Invalid bounding box")
    if east - west > 5 or north - south > 5:
        raise HTTPException(status_code=422, detail="Bounding box is too large")

    now = datetime.now(UTC)
    envelope = func.ST_MakeEnvelope(west, south, east, north, 4326)
    geometry = cast(Event.location, Geometry(geometry_type="POINT", srid=4326))
    conditions = [
        Event.is_published.is_(True),
        Event.city == city,
        Event.ends_at >= now,
        func.ST_Intersects(geometry, envelope),
    ]
    if date_from:
        conditions.append(Event.ends_at >= _date_start(date_from))
    if date_to:
        conditions.append(Event.starts_at <= _date_end(date_to))
    if category:
        conditions.append(Event.category == category)

    events = session.exec(
        select(Event).where(*conditions).order_by(Event.starts_at).limit(500)
    ).all()
    return MapEventsResponse(
        data=[
            MapEvent(
                id=event.id,
                name=event.name,
                category=event.category,
                status=event.status,
                starts_at=event.starts_at,
                latitude=event.latitude,
                longitude=event.longitude,
            )
            for event in events
        ],
        meta={"count": len(events)},
    )


@router.get("/{event_id}", response_model=EventDetailResponse)
def get_event(event_id: UUID, session: SessionDep) -> EventDetailResponse:
    event = session.get(Event, event_id)
    if event is None or not event.is_published:
        raise HTTPException(status_code=404, detail="Event not found")

    evidence_rows = session.exec(
        select(EventSourceLink, Source)
        .join(Source, Source.id == EventSourceLink.source_id)
        .where(EventSourceLink.event_id == event_id)
        .order_by(Source.is_official.desc(), EventSourceLink.checked_at.desc())
    ).all()
    history_rows = session.exec(
        select(StatusHistory, Source)
        .join(Source, Source.id == StatusHistory.source_id, isouter=True)
        .where(StatusHistory.event_id == event_id)
        .order_by(StatusHistory.changed_at.desc())
    ).all()

    base = _summary(event).model_dump()
    detail = EventDetail(
        **base,
        description=event.description,
        official_url=event.official_url,
        sources=[
            SourceEvidence(
                id=source.id,
                name=source.name,
                url=source.url,
                level=source.level,
                is_official=source.is_official,
                reliability_score=source.reliability_score,
                evidence_url=link.evidence_url,
                checked_at=link.checked_at,
            )
            for link, source in evidence_rows
        ],
        status_history=[
            StatusHistoryPublic(
                id=history.id,
                status=history.status,
                note=history.note,
                changed_at=history.changed_at,
                source_name=source.name if source else None,
            )
            for history, source in history_rows
        ],
    )
    return EventDetailResponse(data=detail)
