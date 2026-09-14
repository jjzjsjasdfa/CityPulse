from typing import Literal

from pydantic import BaseModel, Field


class SourceCoordinates(BaseModel):
    longitude: float
    latitude: float
    system: Literal["bd09", "gcj02", "wgs84"]


class PlaceMatch(BaseModel):
    id: str
    name: str
    city: str
    district: str
    address: str
    longitude: float
    latitude: float
    source_coordinates: SourceCoordinates


class EnrichmentInfo(BaseModel):
    detail_status: Literal["not_requested", "ok", "unavailable"] = "not_requested"
    detail_url: str | None = None
    venue_url: str | None = None
    time_text: str | None = None
    location_method: Literal["showstart", "amap"] | None = None
    source_coordinates: SourceCoordinates | None = None
    warnings: list[str] = Field(default_factory=list)
    place_matches: list[PlaceMatch] = Field(default_factory=list)
