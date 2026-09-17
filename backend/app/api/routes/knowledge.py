"""Reviewed knowledge and account-owned favorites. OCR never writes public entries."""
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, ValidationError
from sqlalchemy import and_, delete, func, or_
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import select

from app.core.security import AdminDep, SessionDep, UserDep
from app.models import Artist, Entry, EntryName, Event, EventEntry, Favorite, KnowledgeRevision
from app.poster_service import normalized

router = APIRouter(tags=["knowledge"])
Kind = Literal['person', 'organization', 'brand', 'place', 'event']


class Link(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    url: HttpUrl


class EntryInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    kind: Kind
    name: str = Field(min_length=1, max_length=200)
    aliases: list[str] = Field(default_factory=list, max_length=30)
    description: str = Field(default='', max_length=5000)
    references: list[Link] = Field(default_factory=list, max_length=20)
    # Person fields are validated by the existing ArtistInput contract below.
    person: dict = Field(default_factory=dict)
    version: int | None = None
    note: str = Field(min_length=1, max_length=1000)


def public_entry(row):
    return {'id': row.id, 'kind': row.kind, 'name': row.name, 'version': row.version, **row.profile}


def index_entry(session, row):
    session.flush()
    session.exec(delete(EntryName).where(EntryName.entry_id == row.id))
    for name in {normalized(n) for n in [row.name, *row.profile.get('aliases', [])] if normalized(n)}:
        if len(name) > 200:
            raise HTTPException(422, '词条别名过长')
        session.add(EntryName(entry_id=row.id, name=name))
    session.flush()


def save_entry(session, body, admin_id, entry_id=None, poster_id=None):
    from app.api.routes.posters import ArtistInput
    row = session.exec(select(Entry).where(Entry.id == entry_id).with_for_update()).first() if entry_id else None
    if entry_id and not row:
        raise HTTPException(404, '词条不存在')
    if row and body.version != row.version:
        raise HTTPException(409, '词条已被其他管理员修改，请重新加载后核对')
    if row and row.kind != body.kind:
        raise HTTPException(422, '不能改变已有词条类型')
    before = public_entry(row) if row else {}
    if not normalized(body.name):
        raise HTTPException(422, '请填写有效的词条名称')
    # Same names are legitimate; never automatically combine two identities.
    try:
        person = ArtistInput.model_validate({**body.person, 'name': body.name}).model_dump(mode='json', exclude={'name'}) if body.kind == 'person' else {}
    except ValidationError as error:
        raise HTTPException(422, '人物资料格式错误，请检查出生日期、代表作和字段长度') from error
    profile = {**person, 'aliases': body.aliases, 'description': body.description,
               'references': [r.model_dump(mode='json') for r in body.references]}
    row = row or Entry(kind=body.kind, name=body.name)
    row.name, row.profile = body.name, profile
    if before:
        row.version += 1
    session.add(row)
    index_entry(session, row)
    if row.kind == 'person':
        artist = session.get(Artist, row.id) or Artist(id=row.id, name=row.name)
        artist.name, artist.profile = row.name, row.profile
        session.add(artist)
    # JSON-safe snapshots, including the actor and source submission.
    import json
    session.add(KnowledgeRevision(entry_id=row.id, reviewer_id=admin_id, poster_id=poster_id,
        before=json.loads(json.dumps(before, default=str)), after=json.loads(json.dumps(public_entry(row), default=str)), note=body.note))
    return row


@router.get('/entries')
def entries(session: SessionDep, q: str = Query(default='', max_length=200), kind: Kind | None = None,
            offset: int = Query(default=0, ge=0), limit: int = Query(default=20, ge=1, le=100)):
    statement = select(Entry)
    if kind:
        statement = statement.where(Entry.kind == kind)
    if normalized(q):
        key = normalized(q)
        score = select(func.max(func.similarity(EntryName.name, key))).where(EntryName.entry_id == Entry.id).correlate(Entry).scalar_subquery()
        short_name = and_(EntryName.name.startswith(key[0], autoescape=True), func.length(EntryName.name).between(max(2,len(key)-1),len(key)+1)) if 2 <= len(key) <= 4 else False
        matching = select(EntryName.entry_id).where(or_(EntryName.name.icontains(key, autoescape=True), EntryName.name.op('%')(key), short_name))
        statement = statement.where(Entry.id.in_(matching)).order_by(score.desc())
    rows = session.exec(statement.order_by(Entry.name, Entry.id).offset(offset).limit(limit + 1)).all()
    return {'items': [public_entry(r) for r in rows[:limit]], 'has_more': len(rows) > limit, 'offset': offset}


@router.get('/entries/{entry_id}')
def entry(entry_id: UUID, session: SessionDep):
    row = session.get(Entry, entry_id)
    if not row:
        raise HTTPException(404, '词条不存在')
    return public_entry(row)


@router.post('/admin/entries')
def create(body: EntryInput, session: SessionDep, admin: AdminDep):
    row = save_entry(session, body, admin.id)
    session.commit()
    return public_entry(row)


@router.put('/admin/entries/{entry_id}')
def update(entry_id: UUID, body: EntryInput, session: SessionDep, admin: AdminDep):
    row = save_entry(session, body, admin.id, entry_id)
    session.commit()
    return public_entry(row)


@router.get('/admin/entries/{entry_id}/revisions')
def revisions(entry_id: UUID, session: SessionDep, admin: AdminDep, offset: int = Query(default=0, ge=0)):
    return session.exec(select(KnowledgeRevision).where(KnowledgeRevision.entry_id == entry_id)
                        .order_by(KnowledgeRevision.created_at.desc(), KnowledgeRevision.id).offset(offset).limit(20)).all()


def resolve_names(session, facts):
    fields = [('name', facts.get('name'), 'event'), ('organizer', facts.get('organizer'), 'organization'),
              ('place', facts.get('place'), 'place'), *[('artists', n, 'person') for n in facts.get('artists', [])]]
    keys = {normalized(part) for field, name, _ in fields if name for part in ([name, name.split(' · ')[-1]] if field == 'place' else [name])}
    rows = session.exec(select(Entry, EntryName.name).join(EntryName).where(EntryName.name.in_(keys))).all() if keys else []
    links = []
    for field, name, kind in fields:
        if not name:
            continue
        possible_keys = {normalized(name), normalized(name.split(' · ')[-1])} if field == 'place' else {normalized(name)}
        matches = {r.id: r for r, key in rows if key in possible_keys and (r.kind == kind or (kind == 'organization' and r.kind == 'brand'))}
        links.append({'field': field, 'text': name, 'entry': public_entry(next(iter(matches.values()))) if len(matches) == 1 else None,
                      'ambiguous': len(matches) > 1})
    return links


@router.get('/event-search')
def event_search(session: SessionDep, q: str = Query(default='', max_length=200), place: str = Query(default='', max_length=300),
                 offset: int = Query(default=0, ge=0), limit: int = Query(default=20, ge=1, le=50)):
    statement = select(Event).where(Event.is_published.is_(True), Event.is_demo.is_(False))
    if q.strip():
        statement = statement.where(or_(Event.name.icontains(q.strip(), autoescape=True), Event.name.op('%')(q.strip()),
                                        Event.venue_name.icontains(q.strip(), autoescape=True)))
        statement = statement.order_by(func.similarity(Event.name, q.strip()).desc())
    if place.strip():
        statement = statement.where(or_(Event.city.icontains(place.strip(), autoescape=True), Event.address.icontains(place.strip(), autoescape=True),
                                        Event.venue_name.icontains(place.strip(), autoescape=True)))
    rows = session.exec(statement.order_by(Event.starts_at.desc(), Event.id).offset(offset).limit(limit + 1)).all()
    return {'items': [{'id': r.id, 'name': r.name, 'place': r.venue_name, 'starts_at': r.starts_at} for r in rows[:limit]], 'has_more': len(rows) > limit}


def add_favorite(session, user_id, event_id):
    session.execute(insert(Favorite).values(user_id=user_id, event_id=event_id, created_at=datetime.now(UTC)).on_conflict_do_nothing())


@router.get('/favorites')
def favorites(session: SessionDep, user: UserDep, offset: int = Query(default=0, ge=0)):
    rows = session.exec(select(Favorite).where(Favorite.user_id == user.id).order_by(Favorite.created_at, Favorite.event_id).offset(offset).limit(101)).all()
    return {'ids': [r.event_id for r in rows[:100]], 'has_more': len(rows) > 100}


@router.put('/favorites/{event_id}')
def favorite(event_id: UUID, session: SessionDep, user: UserDep):
    event = session.get(Event, event_id)
    if not event or not event.is_published or event.is_demo:
        raise HTTPException(404, '活动不存在')
    add_favorite(session, user.id, event_id)
    session.commit()
    return {'saved': True}


@router.delete('/favorites/{event_id}')
def unfavorite(event_id: UUID, session: SessionDep, user: UserDep):
    session.exec(delete(Favorite).where(Favorite.user_id == user.id, Favorite.event_id == event_id))
    session.commit()
    return {'saved': False}
