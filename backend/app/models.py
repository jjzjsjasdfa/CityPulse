from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import JSON, Column, DateTime, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class Entry(SQLModel, table=True):
    __tablename__ = "entries"
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    kind: str = Field(index=True, max_length=24)
    name: str = Field(max_length=200, index=True)
    profile: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    version: int = 1


class EntryName(SQLModel, table=True):
    __tablename__ = "entry_names"
    entry_id: UUID = Field(foreign_key="entries.id", ondelete="CASCADE", primary_key=True)
    name: str = Field(primary_key=True, max_length=200, index=True)


class EventEntry(SQLModel, table=True):
    __tablename__ = "event_entries"
    event_id: UUID = Field(foreign_key="events.id", ondelete="CASCADE", primary_key=True)
    entry_id: UUID = Field(foreign_key="entries.id", primary_key=True)
    role: str = Field(primary_key=True, max_length=24)


class KnowledgeRevision(SQLModel, table=True):
    __tablename__ = "knowledge_revisions"
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    entry_id: UUID = Field(foreign_key="entries.id", index=True)
    reviewer_id: UUID = Field(foreign_key="users.id")
    poster_id: UUID | None = Field(default=None, foreign_key="poster_submissions.id")
    before: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    after: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    note: str = Field(max_length=1000)
    created_at: datetime = Field(default_factory=utc_now, sa_type=DateTime(timezone=True))


class Favorite(SQLModel, table=True):
    __tablename__ = "favorites"
    user_id: UUID = Field(foreign_key="users.id", ondelete="CASCADE", primary_key=True)
    event_id: UUID = Field(foreign_key="events.id", ondelete="CASCADE", primary_key=True)
    created_at: datetime = Field(default_factory=utc_now, sa_type=DateTime(timezone=True))


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


class IngestionRunStatus(StrEnum):
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class CandidateReviewStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class UserRole(StrEnum):
    regular = "regular"
    admin = "admin"


class Artist(SQLModel, table=True):
    __tablename__ = "artists"
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(max_length=100, index=True)
    profile: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))


class PosterSubmission(SQLModel, table=True):
    __tablename__ = "poster_submissions"
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    image: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    image_hash: str = Field(max_length=64, index=True)
    raw_text: str = Field(sa_column=Column(Text, nullable=False))
    extracted: dict = Field(sa_column=Column(JSON, nullable=False))
    status: str = Field(default="pending", max_length=20, index=True)
    event_id: UUID | None = Field(default=None, foreign_key="events.id")
    reviewed_by: UUID | None = Field(default=None, foreign_key="users.id")
    review_note: str | None = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=utc_now, sa_type=DateTime(timezone=True))


class EventBackground(SQLModel, table=True):
    __tablename__ = "event_backgrounds"
    event_id: UUID = Field(primary_key=True, foreign_key="events.id", ondelete="CASCADE")
    artist_ids: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    references: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(max_length=320, unique=True, index=True)
    password_hash: str = Field(max_length=256)
    nickname: str = Field(default='', max_length=40)
    avatar: str = Field(default='person', max_length=20)
    role: UserRole = Field(default=UserRole.regular, sa_column=Column(String(16), nullable=False))
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now, sa_type=DateTime(timezone=True))


class NicknameChange(SQLModel, table=True):
    __tablename__ = "nickname_changes"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", ondelete="CASCADE", index=True)
    current_nickname: str = Field(default="", max_length=40)
    proposed_nickname: str = Field(max_length=40)
    status: str = Field(default="pending", max_length=16, index=True)
    review_note: str = Field(default="", max_length=500)
    reviewed_by: UUID | None = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utc_now, sa_type=DateTime(timezone=True))
    reviewed_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))


class AuthSession(SQLModel, table=True):
    __tablename__ = "auth_sessions"

    token_hash: str = Field(max_length=64, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", ondelete="CASCADE", index=True)
    expires_at: datetime = Field(sa_type=DateTime(timezone=True), index=True)


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
    price: str | None = Field(default=None, max_length=80)
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
    reviewed_by: UUID | None = Field(default=None, foreign_key="users.id")
    resolution_note: str | None = Field(default=None, max_length=1000)
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


class EventRevision(SQLModel, table=True):
    __tablename__ = "event_revisions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    event_id: UUID = Field(foreign_key="events.id", ondelete="CASCADE", index=True)
    actor_id: UUID = Field(foreign_key="users.id")
    correction_id: UUID | None = Field(default=None, foreign_key="corrections.id")
    note: str = Field(max_length=1000)
    before: dict = Field(sa_column=Column(JSONB, nullable=False))
    after: dict = Field(sa_column=Column(JSONB, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, sa_type=DateTime(timezone=True))


class IngestionRun(SQLModel, table=True):
    __tablename__ = "ingestion_runs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    source_id: UUID = Field(foreign_key="sources.id", ondelete="CASCADE", index=True)
    status: IngestionRunStatus = Field(sa_column=Column(String(32), nullable=False))
    started_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    finished_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    discovered_count: int = 0
    changed_count: int = 0
    candidate_count: int = 0
    error_message: str | None = Field(default=None, sa_column=Column(Text, nullable=True))


class RawSourceItem(SQLModel, table=True):
    __tablename__ = "raw_source_items"
    __table_args__ = (
        UniqueConstraint("source_id", "external_id", name="uq_raw_source_item_identity"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    source_id: UUID = Field(foreign_key="sources.id", ondelete="CASCADE", index=True)
    external_id: str = Field(max_length=64)
    canonical_url: str = Field(max_length=500)
    title: str = Field(max_length=300)
    content_hash: str = Field(max_length=64)
    payload: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB().with_variant(JSON(), "sqlite"), nullable=False),
    )
    fetched_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    first_seen_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    last_seen_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


class EventCandidate(SQLModel, table=True):
    __tablename__ = "event_candidates"
    __table_args__ = (UniqueConstraint("raw_item_id", name="uq_event_candidate_raw_item"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    event_id: UUID | None = Field(default=None, foreign_key="events.id", unique=True)
    reviewed_by: UUID | None = Field(default=None, foreign_key="users.id")
    reviewed_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    review_note: str | None = Field(default=None, max_length=1000)
    raw_item_id: UUID = Field(foreign_key="raw_source_items.id", ondelete="CASCADE")
    source_id: UUID = Field(foreign_key="sources.id", ondelete="CASCADE", index=True)
    name: str = Field(max_length=300)
    category: EventCategory = Field(sa_column=Column(String(32), nullable=False))
    organizer: str | None = Field(default=None, max_length=180)
    price: str | None = Field(default=None, max_length=80)
    venue_name: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=80, index=True)
    district: str | None = Field(default=None, max_length=80)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    source_status: str | None = Field(default=None, max_length=32)
    source_published_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    starts_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    ends_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    official_url: str = Field(max_length=500)
    fingerprint: str = Field(max_length=64, index=True)
    facts: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB().with_variant(JSON(), "sqlite"), nullable=False),
    )
    review_status: CandidateReviewStatus = Field(
        default=CandidateReviewStatus.pending,
        sa_column=Column(String(32), nullable=False),
    )
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    updated_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))

    @property
    def enrichment(self) -> dict:
        return self.facts.get("facts", {}).get("enrichment", {})
