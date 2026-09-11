from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.database import get_session
from app.models import Correction, Event
from app.schemas import CorrectionCreate, CorrectionResponse

router = APIRouter(prefix="/corrections", tags=["corrections"])
SessionDep = Annotated[Session, Depends(get_session)]


@router.post("", response_model=CorrectionResponse, status_code=status.HTTP_202_ACCEPTED)
def create_correction(payload: CorrectionCreate, session: SessionDep) -> CorrectionResponse:
    if payload.event_id is not None and session.get(Event, payload.event_id) is None:
        raise HTTPException(status_code=404, detail="Event not found")

    correction = Correction(
        event_id=payload.event_id,
        kind=payload.kind,
        message=payload.message,
        evidence_url=str(payload.evidence_url) if payload.evidence_url else None,
        contact_email=payload.contact_email,
    )
    session.add(correction)
    session.commit()
    session.refresh(correction)
    return CorrectionResponse(data=correction)

