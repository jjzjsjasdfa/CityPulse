"""Administrator correction inbox and decisions."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.core.security import AdminDep, SessionDep, aware_utc
from app.models import Correction, CorrectionStatus
from app.schemas import AdminCorrection, AdminCorrectionSummary, CorrectionReview
from app.services.events import apply_event_update

router = APIRouter(prefix="/admin/corrections", tags=["admin-corrections"])


def _summary(correction: Correction) -> AdminCorrectionSummary:
    preview = correction.message
    if len(preview) > 160:
        preview = preview[:157].rstrip() + "..."
    return AdminCorrectionSummary(
        id=correction.id,
        kind=correction.kind,
        message_preview=preview,
        status=correction.status,
        created_at=correction.created_at,
    )


@router.get("", response_model=list[AdminCorrectionSummary])
def list_corrections(
    session: SessionDep,
    admin: AdminDep,
    status: CorrectionStatus = CorrectionStatus.pending,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    corrections = session.exec(
        select(Correction)
        .where(Correction.status == status)
        .order_by(Correction.created_at, Correction.id)
        .offset(offset)
        .limit(limit)
    ).all()
    return [_summary(correction) for correction in corrections]


@router.get("/{correction_id}", response_model=AdminCorrection)
def get_correction(correction_id: UUID, session: SessionDep, admin: AdminDep):
    correction = session.get(Correction, correction_id)
    if correction is None:
        raise HTTPException(404, "Correction not found")
    return correction


@router.post("/{correction_id}/review", response_model=AdminCorrection)
def review_correction(
    correction_id: UUID,
    body: CorrectionReview,
    session: SessionDep,
    admin: AdminDep,
):
    correction = session.exec(
        select(Correction).where(Correction.id == correction_id).with_for_update()
    ).first()
    if correction is None:
        raise HTTPException(404, "Correction not found")
    if correction.status in ("accepted", "rejected") or aware_utc(
        correction.updated_at
    ) != body.expected_updated_at.astimezone(UTC):
        raise HTTPException(409, "Correction changed or was already resolved. Refresh the inbox.")
    if body.event_update is not None:
        if correction.event_id is None:
            raise HTTPException(422, "Correction has no linked event")
        apply_event_update(session, correction.event_id, body.event_update, admin, correction.id)
    correction.status = body.status
    correction.resolution_note = body.resolution_note
    correction.reviewed_by = admin.id
    correction.updated_at = datetime.now(UTC)
    session.add(correction)
    session.commit()
    session.refresh(correction)
    return correction
