from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol, Self

from app.models import EventCategory, SourceLevel


@dataclass(frozen=True)
class SourceSpec:
    key: str
    name: str
    url: str
    level: SourceLevel
    is_official: bool
    reliability_score: float


def _normalized(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip().casefold()


@dataclass(frozen=True)
class IngestionItem:
    """Normalized factual fields shared by all source adapters."""

    title: str
    canonical_url: str
    source_status: str | None = None
    source_published_at: datetime | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    category: EventCategory = EventCategory.public_culture
    organizer: str | None = None
    price: str | None = None
    venue_name: str | None = None
    address: str | None = None
    city: str | None = None
    district: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    facts: dict[str, Any] = field(default_factory=dict)

    @property
    def external_id(self) -> str:
        return hashlib.sha256(self.canonical_url.encode()).hexdigest()

    @property
    def fingerprint(self) -> str:
        identity = "|".join(
            (
                _normalized(self.title),
                _normalized(self.venue_name),
                self.starts_at.isoformat() if self.starts_at else "",
            )
        )
        return hashlib.sha256(identity.encode()).hexdigest()

    def payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "title": self.title,
            "canonical_url": self.canonical_url,
            "source_status": self.source_status,
            "source_published_at": (
                self.source_published_at.isoformat() if self.source_published_at else None
            ),
            "starts_at": self.starts_at.isoformat() if self.starts_at else None,
            "ends_at": self.ends_at.isoformat() if self.ends_at else None,
            "category": self.category,
            "organizer": self.organizer,
            "price": self.price,
            "venue_name": self.venue_name,
            "address": self.address,
            "city": self.city,
            "district": self.district,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "facts": self.facts,
        }
        # Fail early if an adapter adds a value PostgreSQL JSON cannot store.
        json.dumps(payload, ensure_ascii=False)
        return payload


class SourceAdapter(Protocol):
    source: SourceSpec

    def fetch(self, *, limit: int = 20) -> list[IngestionItem]: ...

    def close(self) -> None: ...

    def __enter__(self) -> Self: ...

    def __exit__(self, *_args: object) -> None: ...
