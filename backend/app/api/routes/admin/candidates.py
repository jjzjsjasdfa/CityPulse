from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.core.config import settings
from app.core.security import AdminDep, SessionDep, aware_utc
from app.ingestion.places import VenueLookup
from app.ingestion.runner import content_hash
from app.ingestion.showstart import ShowStartVenueAdapter
from app.ingestion.types import IngestionItem
from app.models import (
    CandidateReviewStatus,
    Event,
    EventCandidate,
    EventSourceLink,
    RawSourceItem,
    Source,
    StatusHistory,
)
from app.schemas import (
    AdminCandidate,
    CandidateApproval,
    CandidateComparison,
    CandidateEnrich,
    CandidateRejection,
    FieldChange,
)

router = APIRouter(prefix="/admin/candidates", tags=["admin-candidates"])


@router.get("", response_model=list[AdminCandidate])
def list_candidates(
    session: SessionDep,
    admin: AdminDep,
    status: CandidateReviewStatus = CandidateReviewStatus.pending,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    return session.exec(
        select(EventCandidate)
        .where(EventCandidate.review_status == status)
        .order_by(EventCandidate.updated_at.desc(), EventCandidate.id)
        .offset(offset)
        .limit(limit)
    ).all()


def _lock_pending_candidate(session, candidate_id: UUID, expected: datetime) -> EventCandidate:
    candidate = session.exec(
        select(EventCandidate).where(EventCandidate.id == candidate_id).with_for_update()
    ).first()
    if candidate is None:
        raise HTTPException(404, "Candidate not found")
    if candidate.review_status != CandidateReviewStatus.pending or aware_utc(
        candidate.updated_at
    ) != expected.astimezone(UTC):
        raise HTTPException(409, "Candidate changed or was already reviewed. Refresh the queue.")
    return candidate


@router.get("/{candidate_id}/comparison", response_model=CandidateComparison)
def compare_candidate_source(candidate_id: UUID, session: SessionDep, admin: AdminDep):
    candidate = session.get(EventCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(404, "Candidate not found")
    event = session.get(Event, candidate.event_id) if candidate.event_id else None
    changes = []
    if event:
        for field in (
            "name",
            "category",
            "organizer",
            "price",
            "starts_at",
            "ends_at",
            "venue_name",
            "address",
            "city",
            "district",
            "latitude",
            "longitude",
            "official_url",
        ):
            before, after = getattr(event, field), getattr(candidate, field)
            if before != after:
                changes.append(
                    FieldChange(
                        field=field,
                        before=str(before) if before is not None else None,
                        after=str(after) if after is not None else None,
                    )
                )
    return CandidateComparison(event_id=candidate.event_id, changes=changes)


@router.post("/{candidate_id}/enrich", response_model=AdminCandidate)
def enrich_candidate(
    candidate_id: UUID, body: CandidateEnrich, session: SessionDep, admin: AdminDep
):
    candidate = _lock_pending_candidate(session, candidate_id, body.expected_updated_at)
    raw_id = candidate.raw_item_id
    item = IngestionItem(
        title=candidate.name,
        canonical_url=candidate.official_url,
        category=candidate.category,
        organizer=candidate.organizer,
        price=candidate.price,
        source_status=candidate.source_status,
        source_published_at=candidate.source_published_at,
        starts_at=candidate.starts_at,
        ends_at=candidate.ends_at,
        venue_name=candidate.venue_name,
        address=candidate.address,
        city=candidate.city,
        district=candidate.district,
        latitude=candidate.latitude,
        longitude=candidate.longitude,
        facts=candidate.facts.get("facts", {}),
    )
    # Release the row lock during network I/O, then detect intervening review/imports.
    session.rollback()
    try:
        api_key = settings.amap_api_key.get_secret_value() if settings.amap_api_key else None
        if urlsplit(item.canonical_url).hostname == "www.showstart.com":
            with ShowStartVenueAdapter(
                user_agent=settings.ingestion_user_agent, amap_api_key=api_key
            ) as adapter:
                enriched = adapter.enrich(item)
        else:
            with httpx.Client(timeout=20) as client:
                enriched = VenueLookup(api_key, client).enrich(item)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    # Keep the same raw-item -> candidate lock ordering as the ingestion runner.
    raw = session.exec(
        select(RawSourceItem).where(RawSourceItem.id == raw_id).with_for_update()
    ).one()
    candidate = _lock_pending_candidate(session, candidate_id, body.expected_updated_at)
    for field in (
        "organizer",
        "price",
        "starts_at",
        "ends_at",
        "venue_name",
        "address",
        "city",
        "district",
        "latitude",
        "longitude",
    ):
        setattr(candidate, field, getattr(enriched, field))
    candidate.facts = {**candidate.facts, **enriched.payload()}
    candidate.name = enriched.title
    candidate.updated_at = datetime.now(UTC)
    raw.payload = enriched.payload()
    raw.content_hash = content_hash(enriched)
    raw.title = enriched.title
    raw.fetched_at = datetime.now(UTC)
    session.add(raw)
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return candidate


@router.post("/{candidate_id}/approve", response_model=AdminCandidate)
def approve_candidate(
    candidate_id: UUID, body: CandidateApproval, session: SessionDep, admin: AdminDep
):
    candidate = _lock_pending_candidate(session, candidate_id, body.expected_updated_at)
    source = session.get(Source, candidate.source_id)
    if source is None:
        raise HTTPException(409, "Candidate source no longer exists")
    now = datetime.now(UTC)
    event = session.get(Event, candidate.event_id) if candidate.event_id else None
    values = body.model_dump(exclude={"expected_updated_at", "review_note", "evidence_url"})
    values.update(
        official_url=str(body.evidence_url),
        location=f"SRID=4326;POINT({body.longitude} {body.latitude})",
        last_verified_at=now,
        confidence=source.reliability_score,
        is_demo=False,
        is_published=True,
        updated_at=now,
    )
    if event is None:
        event = Event(**values, slug=f"event-{candidate.id}", published_at=now)
    else:
        for key, value in values.items():
            setattr(event, key, value)
    session.add(event)
    session.flush()
    link = session.get(EventSourceLink, (event.id, source.id))
    if link is None:
        link = EventSourceLink(
            event_id=event.id,
            source_id=source.id,
            evidence_url=candidate.official_url,
            checked_at=now,
        )
    link.checked_at = now
    link.evidence_url = candidate.official_url
    session.add(link)
    session.add(
        StatusHistory(
            event_id=event.id,
            source_id=source.id,
            status=event.status,
            note=body.review_note[:300],
            changed_at=now,
        )
    )
    candidate.event_id = event.id
    candidate.review_status = CandidateReviewStatus.approved
    candidate.reviewed_by = admin.id
    candidate.reviewed_at = now
    candidate.review_note = body.review_note
    candidate.updated_at = now
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return candidate


@router.post("/{candidate_id}/reject", response_model=AdminCandidate)
def reject_candidate(
    candidate_id: UUID, body: CandidateRejection, session: SessionDep, admin: AdminDep
):
    candidate = _lock_pending_candidate(session, candidate_id, body.expected_updated_at)
    now = datetime.now(UTC)
    candidate.review_status = CandidateReviewStatus.rejected
    candidate.reviewed_by = admin.id
    candidate.reviewed_at = now
    candidate.review_note = body.review_note
    candidate.updated_at = now
    if candidate.event_id:
        event = session.get(Event, candidate.event_id)
        if event:
            event.is_published = False
            event.updated_at = now
            session.add(event)
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return candidate
