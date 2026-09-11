from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import JSON, Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class EventCategory(StrEnum):
    performance = "performance"
    sports = "sports"
    exhibition = "exhibition"
    festival = "festival"
    market = "market"
    public_culture = "public_culture"
    pop_up = "pop_up"
    seasonal = "seasonal"


class EventStatus(StrEnum):
    announced = "announced"
    on_sale = "on_sale"
    sold_out = "sold_out"
    postponed = "postponed"
    cancelled = "cancelled"
    ended = "ended"


class SourceLevel(StrEnum):
    authority = "authority"
    trusted = "trusted"
    lead = "lead"


class CorrectionStatus(StrEnum):
    pending = "pending"
    reviewing = "reviewing"
    accepted = "accepted"
    rejected = "rejected"


class Source(SQLModel, table=True):
    __tablename__ = "sources"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(max_length=160)
    url: str = Field(max_length=500)
    level: SourceLevel = Field(sa_column=Column(String(32), nullable=False))
    is_official: bool = False
    reliability_score: float = Field(default=0.5, ge=0, le=1)
    created_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class Event(SQLModel, table=True):
    __tablename__ = "events"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    slug: str = Field(max_length=180, unique=True, index=True)
    name: str = Field(max_length=200)
    category: EventCategory = Field(sa_column=Column(String(32), nullable=False))
    summary: str = Field(max_length=360)
    description: str = Field(sa_column=Column(Text, nullable=False))
    starts_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    ends_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    venue_name: str = Field(max_length=200)
    address: str = Field(max_length=300)
    city: str = Field(max_length=80, index=True)
    district: str = Field(max_length=80)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    location: Any = Field(
        sa_column=Column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    )
    organizer: str = Field(max_length=180)
    status: EventStatus = Field(sa_column=Column(String(32), nullable=False))
    last_verified_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    confidence: float = Field(ge=0, le=1)
    traits: list[str] = Field(
        default_factory=list,
        sa_column=Column("attributes", JSONB().with_variant(JSON(), "sqlite"), nullable=False),
    )
    official_url: str = Field(max_length=500)
    is_ad: bool = False
    is_demo: bool = False
    is_published: bool = False
    published_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    created_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class EventSourceLink(SQLModel, table=True):
    __tablename__ = "event_source_links"

    event_id: UUID = Field(foreign_key="events.id", primary_key=True, ondelete="CASCADE")
    source_id: UUID = Field(foreign_key="sources.id", primary_key=True, ondelete="CASCADE")
    evidence_url: str = Field(max_length=500)
    checked_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


class StatusHistory(SQLModel, table=True):
    __tablename__ = "status_history"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    event_id: UUID = Field(foreign_key="events.id", ondelete="CASCADE", index=True)
    source_id: UUID | None = Field(default=None, foreign_key="sources.id", ondelete="SET NULL")
    status: EventStatus = Field(sa_column=Column(String(32), nullable=False))
    note: str = Field(max_length=300)
    changed_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


class Correction(SQLModel, table=True):
    __tablename__ = "corrections"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    event_id: UUID | None = Field(default=None, foreign_key="events.id", ondelete="SET NULL")
    kind: str = Field(max_length=40)
    message: str = Field(sa_column=Column(Text, nullable=False))
    evidence_url: str | None = Field(default=None, max_length=500)
    contact_email: str | None = Field(default=None, max_length=320)
    status: CorrectionStatus = Field(
        default=CorrectionStatus.pending,
        sa_column=Column(String(32), nullable=False),
    )
    created_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

