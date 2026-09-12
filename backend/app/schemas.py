from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.models import CorrectionStatus, EventCategory, EventStatus, SourceLevel


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
    id: UUID
    name: str
    category: EventCategory
    status: EventStatus
    starts_at: datetime
    latitude: float
    longitude: float


class MapEventsResponse(BaseModel):
    data: list[MapEvent]
    meta: dict[str, int]


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


class CorrectionPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: CorrectionStatus
    created_at: datetime


class CorrectionResponse(BaseModel):
    data: CorrectionPublic


class ApiError(BaseModel):
    code: str
    message: str
    details: object | None = None


class ApiErrorResponse(BaseModel):
    error: ApiError


class EventFilters(BaseModel):
    city: str = "长沙"
    date_from: date | None = None
    date_to: date | None = None
    category: EventCategory | None = None
    attribute: str | None = None
    sort: Literal["newest", "soonest", "ending_soon"] = "soonest"
