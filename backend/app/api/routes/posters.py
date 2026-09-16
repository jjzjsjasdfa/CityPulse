import hashlib
from datetime import UTC, date, datetime
from threading import BoundedSemaphore
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from sqlmodel import select

from app.api.routes.auth import rate_limit
from app.core.security import AdminDep, SessionDep, UserDep
from app.models import Artist, Event, EventBackground, PosterSubmission
from app.poster_service import extract, match_score, normalized, pipeline_version, recognize
from app.schemas import EventFields

router = APIRouter(tags=["poster-discovery"])
ocr_slots = BoundedSemaphore(2)


class Reference(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    url: HttpUrl


class Work(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    language: str = Field(default="", max_length=60)
    category: str = Field(default="", max_length=60)
    released: str = Field(default="", max_length=40)


class ArtistInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    birth_date: date | None = None
    gender: str = Field(default="", max_length=40)
    hometown: str = Field(default="", max_length=100)
    aliases: list[str] = Field(default_factory=list, max_length=30)
    fan_name: str = Field(default="", max_length=100)
    support_color: str = Field(default="", max_length=100)
    agency: str = Field(default="", max_length=200)
    honors: str = Field(default="", max_length=3000)
    works: list[Work] = Field(default_factory=list, max_length=100)
    references: list[Reference] = Field(default_factory=list, max_length=20)


class Upload(BaseModel):
    image_base64: str = Field(max_length=11_200_000)


class Review(BaseModel):
    approve: bool
    note: str = Field(min_length=1, max_length=1000)
    event_id: UUID | None = None
    new_event: EventFields | None = None
    artist_ids: list[UUID] = Field(default_factory=list, max_length=60)
    references: list[Reference] = Field(default_factory=list, max_length=20)


def public_artist(artist):
    return {"id": artist.id, "name": artist.name, **artist.profile}


@router.get("/artists")
def artists(session: SessionDep, q: str = ""):
    statement = select(Artist)
    if q:
        statement = statement.where(Artist.name.icontains(q[:100], autoescape=True))
    return [public_artist(item) for item in session.exec(statement.order_by(Artist.name).limit(100))]


@router.post("/admin/artists")
def create_artist(body: ArtistInput, session: SessionDep, admin: AdminDep):
    artist = Artist(name=body.name, profile=body.model_dump(mode="json", exclude={"name"}))
    session.add(artist)
    session.commit()
    session.refresh(artist)
    return public_artist(artist)


@router.put("/admin/artists/{artist_id}")
def update_artist(artist_id: UUID, body: ArtistInput, session: SessionDep, admin: AdminDep):
    artist = session.get(Artist, artist_id)
    if not artist:
        raise HTTPException(404, "歌手不存在")
    artist.name = body.name
    artist.profile = body.model_dump(mode="json", exclude={"name"})
    session.add(artist)
    session.commit()
    return public_artist(artist)


def result(row, session):
    facts = row.extracted
    names = {normalized(name) for name in facts.get("artists", [])}
    people = []
    for artist in session.exec(select(Artist).limit(5000)):
        aliases = [artist.name, *artist.profile.get("aliases", [])]
        if any(normalized(alias) in names for alias in aliases):
            people.append(public_artist(artist))
    matches = []
    for event in session.exec(select(Event).where(Event.is_published.is_(True), Event.is_demo.is_(False), Event.ends_at >= datetime.now(UTC)).limit(2000)):
        score, exact = match_score(facts, event)
        if score >= .55:
            matches.append({"id": str(event.id), "name": event.name, "place": event.venue_name,
                            "starts_at": event.starts_at, "score": round(score, 3), "exact": exact})
    matches.sort(key=lambda item: item["score"], reverse=True)
    exact_matches = [item for item in matches if item["exact"]]
    # Same title/venue may have multiple dates. Never choose arbitrarily.
    auto = exact_matches[0]["id"] if len(exact_matches) == 1 else None
    return {"id": row.id, "extracted": facts, "raw_text": row.raw_text,
            "artists": people, "matches": matches[:5], "auto_save_id": auto,
            "status": row.status, "review_note": row.review_note, "event_id": row.event_id}


@router.post("/posters", dependencies=[Depends(rate_limit)])
def upload(body: Upload, session: SessionDep, user: UserDep):
    import base64
    import binascii
    try:
        data = base64.b64decode(body.image_base64, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(422, "图片编码无效") from None
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, "图片不能超过 8 MB")
    digest = hashlib.sha256(data).hexdigest()
    old = session.exec(select(PosterSubmission).where(PosterSubmission.user_id == user.id, PosterSubmission.image_hash == digest)).first()
    if old and (old.status != "pending" or old.extracted.get("_pipeline") == pipeline_version()):
        return result(old, session)
    if not ocr_slots.acquire(blocking=False):
        raise HTTPException(429, "识别任务较多，请稍后重试。")
    try:
        image, text = recognize(data)
    finally:
        ocr_slots.release()
    facts = {**extract(text), "_pipeline": pipeline_version()}
    row = old or PosterSubmission(user_id=user.id, image=image, image_hash=digest,
                                  raw_text=text, extracted=facts)
    row.raw_text = text
    row.extracted = facts
    row.image = image
    session.add(row)
    session.commit()
    session.refresh(row)
    return result(row, session)


@router.get("/posters")
def history(session: SessionDep, user: UserDep):
    rows = session.exec(select(PosterSubmission).where(PosterSubmission.user_id == user.id).order_by(PosterSubmission.created_at.desc()).limit(20))
    return [{"id": row.id, "extracted": row.extracted, "status": row.status, "review_note": row.review_note} for row in rows]


@router.get("/posters/{poster_id}")
def get_poster(poster_id: UUID, session: SessionDep, user: UserDep):
    row = session.get(PosterSubmission, poster_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "投稿不存在")
    return result(row, session)


@router.get("/admin/posters")
def queue(session: SessionDep, admin: AdminDep):
    rows = session.exec(select(PosterSubmission).where(PosterSubmission.status == "pending").order_by(PosterSubmission.created_at).limit(30))
    return [{"id": row.id, "extracted": row.extracted, "raw_text": row.raw_text} for row in rows]


@router.get("/admin/posters/{poster_id}/image")
def poster_image(poster_id: UUID, session: SessionDep, admin: AdminDep):
    row = session.get(PosterSubmission, poster_id)
    if not row:
        raise HTTPException(404, "投稿不存在")
    import base64
    return {"uri": "data:image/png;base64," + base64.b64encode(row.image).decode()}


@router.post("/admin/posters/{poster_id}/review")
def review(poster_id: UUID, body: Review, session: SessionDep, admin: AdminDep):
    row = session.exec(select(PosterSubmission).where(PosterSubmission.id == poster_id).with_for_update()).first()
    if not row or row.status != "pending":
        raise HTTPException(409, "投稿已处理，请刷新列表")
    if body.approve:
        if bool(body.event_id) == bool(body.new_event):
            raise HTTPException(422, "请选择一个已有活动，或填写完整的新活动信息")
        for artist_id in body.artist_ids:
            if not session.get(Artist, artist_id):
                raise HTTPException(422, "所选歌手不存在")
        if body.new_event:
            values = body.new_event.model_dump(exclude={"evidence_url"})
            now = datetime.now(UTC)
            event = Event(**values, slug=f"poster-{row.id}", official_url=str(body.new_event.evidence_url),
                          location=f"SRID=4326;POINT({body.new_event.longitude} {body.new_event.latitude})",
                          last_verified_at=now, published_at=now, confidence=.8, is_published=True)
            session.add(event)
            session.flush()
        else:
            event = session.exec(select(Event).where(Event.id == body.event_id).with_for_update()).first()
            if not event or event.is_demo or not event.is_published:
                raise HTTPException(422, "请选择已发布的真实活动")
        background = session.get(EventBackground, event.id) or EventBackground(event_id=event.id)
        background.artist_ids = list(dict.fromkeys([*background.artist_ids, *map(str, body.artist_ids)]))
        refs = {item["url"]: item for item in background.references}
        refs.update({str(item.url): item.model_dump(mode="json") for item in body.references})
        background.references = list(refs.values())
        session.add(background)
        row.event_id = event.id
    row.status = "approved" if body.approve else "rejected"
    row.reviewed_by = admin.id
    row.review_note = body.note
    session.add(row)
    session.commit()
    return {"status": row.status, "event_id": row.event_id}


@router.get("/events/{event_id}/background")
def background(event_id: UUID, session: SessionDep):
    event = session.get(Event, event_id)
    if not event or not event.is_published or event.is_demo:
        raise HTTPException(404, "活动不存在")
    row = session.get(EventBackground, event_id)
    people = [session.get(Artist, UUID(item)) for item in row.artist_ids] if row else []
    return {"artists": [public_artist(artist) for artist in people if artist],
            "references": row.references if row else []}
