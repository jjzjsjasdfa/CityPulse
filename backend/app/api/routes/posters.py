import hashlib
from datetime import UTC, date, datetime
from threading import BoundedSemaphore
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from sqlmodel import select
from sqlalchemy import func, or_

from app.api.routes.auth import rate_limit
from app.core.security import AdminDep, SessionDep, UserDep
from app.models import Artist, Entry, EventEntry, Event, EventBackground, PosterSubmission
from app.api.routes.knowledge import EntryInput, save_entry, index_entry, resolve_names, public_entry, add_favorite
from app.poster_service import extract, match_score, normalized, pipeline_version, recognize
from app.poster_matching import reconcile
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


class Facts(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    organizer: str | None = Field(default=None, max_length=200)
    time: str | None = Field(default=None, max_length=200)
    place: str | None = Field(default=None, max_length=300)
    artists: list[str] = Field(default_factory=list, max_length=60)


class EntryDecision(BaseModel):
    entry_id: UUID | None = None
    new_entry: EntryInput | None = None
    role: str = Field(pattern='^(performer|organizer|venue|brand|event)$')


class Review(BaseModel):
    approve: bool
    note: str = Field(min_length=1, max_length=1000)
    event_id: UUID | None = None
    new_event: EventFields | None = None
    artist_ids: list[UUID] = Field(default_factory=list, max_length=60)
    references: list[Reference] = Field(default_factory=list, max_length=20)
    corrected: Facts | None = None
    entries: list[EntryDecision] = Field(default_factory=list, max_length=80)


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
    session.flush()
    entry = Entry(id=artist.id, kind='person', name=artist.name, profile=artist.profile)
    session.add(entry)
    index_entry(session, entry)
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
    entry = session.get(Entry, artist.id) or Entry(id=artist.id, kind='person', name=artist.name)
    entry.name, entry.profile = artist.name, {**entry.profile, **artist.profile}
    entry.version += 1
    session.add(entry)
    index_entry(session, entry)
    session.commit()
    return public_artist(artist)


def result(row, session, *, admin=False):
    facts = {key: value for key, value in row.extracted.get('_reviewed', row.extracted).items() if not key.startswith('_')}
    facts, corrections, suggestions = reconcile(session, facts) if '_reviewed' not in row.extracted else (facts, [], [])
    links = resolve_names(session, facts)
    people = [link['entry'] for link in links if link['field'] == 'artists' and link['entry']]
    matches = []
    title = (facts.get('name') or '').strip()
    candidates = session.exec(select(Event).where(Event.is_published.is_(True), Event.is_demo.is_(False),
        or_(Event.name.icontains(title, autoescape=True), Event.name.op('%')(title)))
        .order_by(func.similarity(Event.name, title).desc(), Event.id).limit(201)).all() if title else []
    for event in candidates[:200]:
        score, exact = match_score(facts, event)
        for scene in facts.get('scenes', []):
            scene_score, _ = match_score({**facts, 'place': scene['place'], 'time': scene['time']}, event)
            score = max(score, scene_score)
        if score >= .55:
            matches.append({"id": str(event.id), "name": event.name, "place": event.venue_name,
                            "starts_at": event.starts_at, "score": round(score, 3), "exact": exact})
    matches.sort(key=lambda item: item["score"], reverse=True)
    exact_matches = [item for item in matches if item["exact"]]
    # Same title/venue may have multiple dates. Never choose arbitrarily.
    auto = exact_matches[0]["id"] if len(exact_matches) == 1 and len(candidates) <= 200 and row.status != 'rejected' else None
    if auto:
        matched = next(event for event in candidates if str(event.id) == auto)
        for key, value in [('name', matched.name), ('place', matched.venue_name)]:
            if normalized(facts.get(key) or '') != normalized(value) and (key != 'place' or normalized(value) not in normalized(facts.get(key) or '')):
                facts[key] = value
                corrections.append({'field': key, 'value': value, 'event_id': auto, 'source': '活动名、场馆及日期交叉匹配'})
        links = resolve_names(session, facts)
    refs = {}
    for link in links:
        for ref in (link.get('entry') or {}).get('references', []):
            refs[ref['url']] = ref
    if row.event_id or auto:
        matched_event = session.get(Event, row.event_id or UUID(auto))
        if matched_event and matched_event.is_published and matched_event.official_url:
            refs[matched_event.official_url] = {'label': '活动官方来源', 'url': matched_event.official_url}
    return {"id": row.id, "extracted": facts, **({'raw_text': row.raw_text} if admin else {}),
            'warning': '识别内容可能不准确，请以官方公告为准。',
            'corrections': corrections, 'suggestions': suggestions, 'references': list(refs.values()),
            'quality_warning': '图片清晰度较低，部分文字可能遗漏，建议上传原图。' if row.extracted.get('_quality', {}).get('small_image') else None,
            "artists": people, "matches": matches[:5], "auto_save_id": auto,
            "links": links,
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
        response = result(old, session, admin=user.role == 'admin')
        if response['auto_save_id']:
            add_favorite(session, user.id, UUID(response['auto_save_id']))
            session.commit()
        return response
    if not ocr_slots.acquire(blocking=False):
        raise HTTPException(429, "识别任务较多，请稍后重试。")
    try:
        image, text = recognize(data)
    finally:
        ocr_slots.release()
    if old:
        # A reviewer may have approved this record while the OCR worker was busy.
        old = session.exec(select(PosterSubmission).where(PosterSubmission.id == old.id)
                           .execution_options(populate_existing=True).with_for_update()).one()
        if old.status != 'pending':
            return result(old, session, admin=user.role == 'admin')
    facts = {**extract(text), "_pipeline": pipeline_version(), '_quality': getattr(text, 'quality', {}), '_blocks': getattr(text, 'blocks', [])}
    row = old or PosterSubmission(user_id=user.id, image=image, image_hash=digest,
                                  raw_text=text, extracted=facts)
    row.raw_text = text
    row.extracted = facts
    row.image = image
    session.add(row)
    session.commit()
    session.refresh(row)
    response = result(row, session, admin=user.role == 'admin')
    if response['auto_save_id']:
        add_favorite(session, user.id, UUID(response['auto_save_id']))
        session.commit()
    return response


@router.get("/posters")
def history(session: SessionDep, user: UserDep):
    rows = session.exec(select(PosterSubmission).where(PosterSubmission.user_id == user.id).order_by(PosterSubmission.created_at.desc()).limit(20))
    return [{"id": row.id, "extracted": {k:v for k,v in row.extracted.get('_reviewed', row.extracted).items() if not k.startswith('_')}, "status": row.status, "review_note": row.review_note} for row in rows]


@router.get("/posters/{poster_id}")
def get_poster(poster_id: UUID, session: SessionDep, user: UserDep):
    row = session.get(PosterSubmission, poster_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "投稿不存在")
    response = result(row, session, admin=user.role == 'admin')
    # Reading history must not undo a user's later decision to remove a favorite.
    response['auto_save_id'] = None
    return response


@router.get("/admin/posters")
def queue(session: SessionDep, admin: AdminDep, offset: int = 0):
    rows = session.exec(select(PosterSubmission).where(PosterSubmission.status == "pending").order_by(PosterSubmission.created_at, PosterSubmission.id).offset(max(0, offset)).limit(30))
    return [{"id": row.id, "extracted": row.extracted, "raw_text": row.raw_text} for row in rows]


@router.get("/admin/posters/{poster_id}/image")
def poster_image(poster_id: UUID, session: SessionDep, admin: AdminDep):
    row = session.get(PosterSubmission, poster_id)
    if not row:
        raise HTTPException(404, "投稿不存在")
    import base64
    return {"uri": "data:image/png;base64," + base64.b64encode(row.image).decode()}


@router.get('/admin/posters/{poster_id}')
def admin_poster(poster_id: UUID, session: SessionDep, admin: AdminDep):
    row = session.get(PosterSubmission, poster_id)
    if not row:
        raise HTTPException(404, '投稿不存在')
    return {**result(row, session, admin=True), 'ocr_evidence': row.extracted.get('_blocks', [])}


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
        role_kinds = {'performer': {'person'}, 'organizer': {'organization', 'brand'}, 'venue': {'place'}, 'brand': {'brand'}, 'event': {'event'}}
        for decision in body.entries:
            if bool(decision.entry_id) == bool(decision.new_entry):
                raise HTTPException(422, '词条请选择已有记录或新建，不能同时选择')
            entry = save_entry(session, decision.new_entry, admin.id, poster_id=row.id) if decision.new_entry else session.get(Entry, decision.entry_id)
            if not entry or entry.kind not in role_kinds[decision.role]:
                raise HTTPException(422, '词条类型与活动中的角色不一致')
            if not session.get(EventEntry, (event.id, entry.id, decision.role)):
                session.add(EventEntry(event_id=event.id, entry_id=entry.id, role=decision.role))
            if entry.kind == 'person':
                background.artist_ids = list(dict.fromkeys([*background.artist_ids, str(entry.id)]))
        if body.corrected:
            row.extracted = {**row.extracted, '_reviewed': body.corrected.model_dump(mode='json')}
        row.event_id = event.id
        # Admin has explicitly resolved the activity identity for this submission.
        add_favorite(session, row.user_id, event.id)
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
    facts = {'name': event.name, 'organizer': event.organizer, 'place': event.venue_name,
             'time': event.starts_at.isoformat(), 'artists': [a.name for a in people if a]}
    linked = session.exec(select(Entry, EventEntry.role).join(EventEntry).where(EventEntry.event_id == event.id)).all()
    refs = {r['url']: r for r in (row.references if row else [])}
    if event.official_url:
        refs.setdefault(event.official_url, {'label': '活动官方来源', 'url': event.official_url})
    return {"artists": [public_artist(artist) for artist in people if artist],
            'facts': facts, 'links': resolve_names(session, facts),
            'entries': [{'role': role, 'entry': public_entry(entry)} for entry, role in linked],
            "references": list(refs.values())}
