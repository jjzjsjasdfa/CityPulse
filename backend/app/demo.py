"""Optional local in-memory API. Production app.main never mounts these controls."""

import math
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.demo_data import build_dataset
from app.models import EventCategory
from app.schemas import (
    EventDetailResponse,
    EventPage,
    MapEventsResponse,
    NearbyEventsResponse,
)

app = FastAPI(title="CityPulse 虚构数据测试 API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"]
)
dataset = build_dataset()


def point(event):
    return {
        key: event[key] for key in ("id", "name", "category", "status", "starts_at", "ends_at", "published_at")
    } | {"latitude": event["location"]["latitude"], "longitude": event["location"]["longitude"]}


def distance(latitude, longitude, event):
    lat2, lon2 = event["location"]["latitude"], event["location"]["longitude"]
    a, b = math.radians(latitude), math.radians(lat2)
    h = (
        math.sin((b - a) / 2) ** 2
        + math.cos(a) * math.cos(b) * math.sin(math.radians(lon2 - longitude) / 2) ** 2
    )
    return 6371.0088 * 2 * math.asin(min(1, math.sqrt(h)))


def page_of(rows, offset, limit):
    data = rows[offset : offset + limit]
    more = offset + len(data) < len(rows)
    return {
        "data": data,
        "meta": {
            "count": len(data),
            "has_next": more,
            "next_offset": offset + len(data) if more else None,
        },
    }


def demo_clock(value: datetime | None = None):
    if value is not None and value.tzinfo is None:
        raise HTTPException(422, "Debug time requires a timezone")
    return value or datetime.now(UTC)


def active_rows(category=None, date_from=None, date_to=None, now=None):
    now = demo_clock(now)
    return [
        row
        for row in dataset["events"]
        if datetime.fromisoformat(row["ends_at"]) > now
        and datetime.fromisoformat(row["published_at"]) <= now
        and (not category or row["category"] == category)
        and (
            not date_from
            or datetime.fromisoformat(row["ends_at"])
            >= datetime.combine(date_from, time.min, tzinfo=UTC)
        )
        and (
            not date_to
            or datetime.fromisoformat(row["starts_at"])
            <= datetime.combine(date_to, time.max, tzinfo=UTC)
        )
    ]


@app.get("/health")
def health():
    return {"status": "ok", "mode": "fictional-demo", "count": len(dataset["events"])}


@app.get("/api/v1/demo")
def metadata():
    return {key: value for key, value in dataset.items() if key != "events"}


@app.get("/api/v1/demo/dataset")
def export_dataset():
    return dataset


@app.post("/api/v1/demo/publish")
def publish(demo_now: datetime | None = None):
    # Re-publish 16 existing fixtures in 8 directions; total stays exactly 200.
    now = demo_clock(demo_now).isoformat()
    for row in dataset["events"][80:96]:
        row["published_at"] = now
        # Replay remains useful even when the selected clock is far in the future.
        if datetime.fromisoformat(row["ends_at"]) <= datetime.fromisoformat(now):
            row["starts_at"] = now
            row["ends_at"] = (datetime.fromisoformat(now) + timedelta(hours=6)).isoformat()
    return {"published": 16, "at": now}


@app.get("/api/v1/events", response_model=EventPage)
def events(
    demo_now: datetime | None = None,
    city: str = "长沙",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: EventCategory | None = None,
    sort: Literal["newest", "soonest", "ending_soon"] = "soonest",
    date_from: date | None = None,
    date_to: date | None = None,
    attribute: str | None = None,
):
    rows = [
        e
        for e in active_rows(category, date_from, date_to, demo_now)
        if e["location"]["city"] == city and (not attribute or attribute in e["attributes"])
    ]
    if sort == "ending_soon":
        rows = [
            e
            for e in rows
            if datetime.fromisoformat(e["ends_at"]) <= demo_clock(demo_now) + timedelta(days=7)
        ]
    rows.sort(
        key=lambda e: e["published_at"] if sort == "newest" else e["starts_at"],
        reverse=sort == "newest",
    )
    return {
        "data": rows[(page - 1) * page_size : page * page_size],
        "meta": {
            "page": page,
            "page_size": page_size,
            "total": len(rows),
            "has_next": page * page_size < len(rows),
        },
    }


@app.get("/api/v1/events/map", response_model=MapEventsResponse)
def map_events(
    west: float = Query(ge=-180, le=180),
    east: float = Query(ge=-180, le=180),
    south: float = Query(ge=-90, le=90),
    north: float = Query(ge=-90, le=90),
    demo_now: datetime | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=500),
    city: str | None = None,
    category: EventCategory | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    if west >= east or south >= north or east - west > 20 or north - south > 30:
        raise HTTPException(422, "Invalid bounding box")
    rows = [
        e
        for e in active_rows(category, date_from, date_to, demo_now)
        if west <= e["location"]["longitude"] <= east
        and south <= e["location"]["latitude"] <= north
        and (not city or e["location"]["city"] == city)
    ]
    rows.sort(key=lambda e: (e["starts_at"], e["id"]))
    return page_of([point(e) for e in rows], offset, limit)


@app.get("/api/v1/events/nearby-updates", response_model=NearbyEventsResponse)
def nearby(
    latitude: float = Query(ge=-85, le=85),
    longitude: float = Query(ge=-180, le=180),
    demo_now: datetime | None = None,
    radius_km: float = Query(15, gt=0, le=30),
    since: datetime | None = None,
    until: datetime | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=500),
):
    if any(v is not None and v.tzinfo is None for v in (since, until)):
        raise HTTPException(422, "Update timestamps require a timezone")
    now = demo_clock(demo_now)
    checked = min(until, now) if until else now
    start = since or checked - timedelta(hours=24)
    if start > checked:
        raise HTTPException(422, "Invalid update time range")
    rows = [
        e
        for e in active_rows(now=now)
        if start <= datetime.fromisoformat(e["published_at"]) <= checked
        and e["status"] not in ["ended", "cancelled", "postponed"]
        and distance(latitude, longitude, e) <= radius_km
    ]
    rows.sort(key=lambda e: (e["published_at"], e["id"]))
    return page_of(
        [point(e) | {"published_at": e["published_at"]} for e in rows], offset, limit
    ) | {"checked_at": checked}


@app.get("/api/v1/events/{event_id}", response_model=EventDetailResponse)
def detail(event_id: UUID):
    row = next((e for e in dataset["events"] if e["id"] == str(event_id)), None)
    if row is None:
        raise HTTPException(404, "Event not found")
    return {"data": row}
