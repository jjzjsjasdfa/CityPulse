from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, HttpUrl, model_validator

from app.ingestion.enrichment_types import EnrichmentInfo
from app.models import (
    CandidateReviewStatus,
    CorrectionStatus,
    EventCategory,
    EventStatus,
    SourceLevel,
    UserRole,
)


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr = Field(max_length=320)
    password: str = Field(min_length=12, max_length=128)


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    role: UserRole
    nickname: str = ''
    avatar: str = 'person'
    created_at: datetime


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    nickname: str = Field(min_length=1, max_length=40)
    avatar: Literal['person', 'leaf', 'music', 'sun', 'cat', 'planet'] = 'person'


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime
    user: UserPublic


class AdminCandidate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    category: EventCategory
    organizer: str | None
    price: str | None
    venue_name: str | None
    address: str | None
    city: str | None
    district: str | None
    latitude: float | None
    longitude: float | None
    enrichment: EnrichmentInfo = Field(default_factory=EnrichmentInfo)
    starts_at: datetime | None
    ends_at: datetime | None
    official_url: str
    facts: dict
    review_status: CandidateReviewStatus
    updated_at: datetime
    event_id: UUID | None
    reviewed_by: UUID | None
    reviewed_at: datetime | None
    review_note: str | None


class EventFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    name: str = Field(min_length=1, max_length=200)
    category: EventCategory
    summary: str = Field(min_length=1, max_length=360)
    description: str = Field(min_length=1, max_length=10000)
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    venue_name: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=300)
    city: str = Field(min_length=1, max_length=80)
    district: str = Field(min_length=1, max_length=80)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    organizer: str = Field(min_length=1, max_length=180)
    price: str | None = Field(default=None, max_length=80)
    status: EventStatus
    evidence_url: HttpUrl = Field(max_length=500)

    @model_validator(mode="after")
    def valid_dates(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("End time must be after start time")
        return self


class ReviewedEventFields(EventFields):
    expected_updated_at: AwareDatetime
    review_note: str = Field(min_length=1, max_length=1000)


class CandidateApproval(ReviewedEventFields):
    pass


class AdminEventUpdate(ReviewedEventFields):
    is_published: bool


class AdminEventDetail(EventFields):
    id: UUID
    updated_at: datetime
    is_published: bool


class FieldChange(BaseModel):
    field: str
    before: str | None
    after: str | None


class CandidateComparison(BaseModel):
    event_id: UUID | None
    changes: list[FieldChange]


class AdminEventRevision(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    actor_id: UUID
    correction_id: UUID | None
    note: str
    before: dict
    after: dict
    created_at: datetime


class AdminCorrection(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    event_id: UUID | None
    kind: str
    message: str
    evidence_url: str | None
    contact_email: str | None
    status: CorrectionStatus
    updated_at: datetime
    created_at: datetime
    reviewed_by: UUID | None
    resolution_note: str | None


class CorrectionReview(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_updated_at: AwareDatetime
    status: Literal["reviewing", "accepted", "rejected"]
    resolution_note: str = Field(min_length=1, max_length=1000)
    event_update: AdminEventUpdate | None = None

    @model_validator(mode="after")
    def accepted_update(self):
        if self.event_update is not None and self.status != "accepted":
            raise ValueError("Event changes require accepting the correction")
        return self


class CandidateRejection(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_updated_at: AwareDatetime
    review_note: str = Field(min_length=1, max_length=1000)


class CandidateEnrich(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_updated_at: AwareDatetime


class Location(BaseModel):
    venue_name: str
    address: str
    city: str
    district: str
    latitude: float
    longitude: float


class EventSummary(BaseModel):
    id: UUID
    slug: str
    name: str
    category: EventCategory
    summary: str
    starts_at: datetime
    ends_at: datetime
    location: Location
    organizer: str
    price: str | None = None
    status: EventStatus
    last_verified_at: datetime
    confidence: float
    attributes: list[str]
    is_ad: bool
    is_demo: bool
    is_new: bool
    is_ending_soon: bool


class SourceEvidence(BaseModel):
    id: UUID
    name: str
    url: str
    level: SourceLevel
    is_official: bool
    reliability_score: float
    evidence_url: str
    checked_at: datetime


class StatusHistoryPublic(BaseModel):
    id: UUID
    status: EventStatus
    note: str
    changed_at: datetime
    source_name: str | None = None


class EventDetail(EventSummary):
    description: str
    official_url: str
    sources: list[SourceEvidence]
    status_history: list[StatusHistoryPublic]


class PageMeta(BaseModel):
    page: int
    page_size: int
    total: int
    has_next: bool


class EventPage(BaseModel):
    data: list[EventSummary]
    meta: PageMeta


class EventDetailResponse(BaseModel):
    data: EventDetail


class MapEvent(BaseModel):
    published_at: datetime | None = None
    id: UUID
    name: str
    category: EventCategory
    status: EventStatus
    starts_at: datetime
    ends_at: datetime
    latitude: float
    longitude: float


class MapPageMeta(BaseModel):
    count: int
    has_next: bool
    next_offset: int | None


class MapEventsResponse(BaseModel):
    data: list[MapEvent]
    meta: MapPageMeta


class NearbyEvent(MapEvent):
    published_at: datetime


class NearbyEventsResponse(BaseModel):
    data: list[NearbyEvent]
    meta: MapPageMeta
    checked_at: datetime


class CategoryOption(BaseModel):
    value: EventCategory
    label: str


class CategoriesResponse(BaseModel):
    data: list[CategoryOption]


class CorrectionCreate(BaseModel):
    event_id: UUID | None = None
    kind: Literal["time", "location", "status", "source", "copyright", "other"]
    message: str = Field(min_length=10, max_length=2000)
    evidence_url: HttpUrl | None = None
    contact_email: str | None = Field(default=None, max_length=320)


class CorrectionReceipt(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: CorrectionStatus
    created_at: datetime


class CorrectionResponse(BaseModel):
    data: CorrectionReceipt


class ApiError(BaseModel):
    code: str
    message: str
    details: object | None = None


class ApiErrorResponse(BaseModel):
    error: ApiError
