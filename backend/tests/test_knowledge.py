"""PostGIS tests run in rollback-only schemas; never edit real accounts."""
import base64
import os
from uuid import UUID
import pytest
from sqlalchemy import text
from sqlmodel import select
from app.api.routes import posters
from app.models import Entry, KnowledgeRevision, PosterSubmission
from app.poster_matching import reconcile
from tests.test_candidate_publication import review_client, setup_review  # noqa: F401

pytestmark = pytest.mark.skipif(os.getenv('CITYPULSE_TEST_POSTGRES') != '1', reason='PostGIS integration')


def login(client, email):
    body = {'email': email, 'password': 'test-knowledge-password'}
    assert client.post('/api/v1/auth/register', json=body).status_code == 201
    return {'Authorization': 'Bearer ' + client.post('/api/v1/auth/login', json=body).json()['access_token']}


def test_entries_search_ambiguity_versions_and_permissions(review_client):
    client, session = review_client
    session.execute(text('CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public'))
    admin, _, _ = setup_review(client, session)
    user = login(client, 'knowledge-user@example.com')
    body = {'kind': 'person', 'name': '测试歌手', 'aliases': ['TestSinger'], 'person': {'birth_date': '2000-01-02'}, 'note': '核对官方介绍'}
    assert client.post('/api/v1/admin/entries', headers=user, json=body).status_code == 403
    response = client.post('/api/v1/admin/entries', headers=admin, json=body)
    assert response.status_code == 200, response.text
    entry = response.json()
    assert client.get('/api/v1/entries?q=TestSinger').json()['items'][0]['id'] == entry['id']
    assert client.get('/api/v1/entries?q=TestSnger').json()['items'][0]['id'] == entry['id']
    assert client.put('/api/v1/admin/entries/' + entry['id'], headers=admin, json=body).status_code == 409
    body.update(version=entry['version'], description='核实后补充的简介')
    assert client.put('/api/v1/admin/entries/' + entry['id'], headers=admin, json=body).status_code == 200
    assert client.put('/api/v1/admin/entries/' + entry['id'], headers=admin, json=body).status_code == 409
    assert len(client.get('/api/v1/admin/entries/' + entry['id'] + '/revisions', headers=admin).json()) == 2
    assert client.get('/api/v1/admin/entries/' + entry['id'] + '/revisions', headers=user).status_code == 403
    assert client.post('/api/v1/admin/entries', headers=admin, json={**body, 'person': {'birth_date': 'bad'}}).status_code == 422
    client.post('/api/v1/admin/entries', headers=admin, json={**body, 'name': '另一位歌手'})
    from app.api.routes.knowledge import resolve_names
    link = resolve_names(session, {'artists': ['TestSinger']})[0]
    assert link['entry'] is None and link['ambiguous']
    page = client.get('/api/v1/entries?limit=1').json()
    assert page['has_more'] and len(page['items']) == 1
    assert client.get('/api/v1/entries?limit=1&offset=1').json()['items'][0]['id'] != page['items'][0]['id']


def test_review_atomic_entries_and_account_favorites(review_client, monkeypatch):
    client, session = review_client
    admin, _, _ = setup_review(client, session)
    user = login(client, 'poster-owner@example.com')
    other = login(client, 'other-user@example.com')
    monkeypatch.setattr(posters, 'recognize', lambda data: (b'image', '测试音乐节\n阵容：待审核歌手\n地点：长沙公园\n时间：2027年10月16日'))
    row = client.post('/api/v1/posters', headers=user, json={'image_base64': base64.b64encode(b'poster').decode()}).json()
    assert not session.exec(select(Entry)).all()  # OCR does not publish knowledge.
    event = {'name': '测试音乐节', 'category': 'festival', 'summary': '测试', 'description': '测试活动',
        'starts_at': '2027-10-16T12:00:00+08:00', 'ends_at': '2027-10-16T22:00:00+08:00',
        'venue_name': '长沙公园', 'address': '长沙公园', 'city': '长沙', 'district': '天心区',
        'latitude': 28.2, 'longitude': 112.9, 'organizer': '测试主办方', 'status': 'announced', 'evidence_url': 'https://example.com/event'}
    new_entry = {'kind': 'person', 'name': '核实后的歌手', 'note': '核对阵容', 'references': [{'label': '官网', 'url': 'https://example.com/artist'}]}
    body = {'approve': True, 'note': '核实完成', 'new_event': event,
            'entries': [{'role': 'venue', 'new_entry': new_entry}], 'corrected': {'name': event['name'], 'artists': ['核实后的歌手']}}
    url = f"/api/v1/admin/posters/{row['id']}/review"
    assert client.post(url, headers=admin, json=body).status_code == 422
    session.rollback()  # Fixture shares one session; production closes/rolls back per request.
    assert not session.exec(select(Entry)).all()
    assert session.get(PosterSubmission, UUID(row['id'])).status == 'pending'
    body['entries'][0]['role'] = 'performer'
    response = client.post(url, headers=admin, json=body)
    assert response.status_code == 200, response.text
    event_id = response.json()['event_id']
    approved = client.get(f"/api/v1/posters/{row['id']}", headers=user).json()
    assert approved['extracted']['artists'] == ['核实后的歌手']
    assert 'raw_text' not in approved
    assert '待审核歌手' in session.get(PosterSubmission, UUID(row['id'])).raw_text
    assert approved['links'][-1]['entry']['name'] == '核实后的歌手'
    assert client.get('/api/v1/favorites', headers=user).json()['ids'] == [event_id]
    assert client.get('/api/v1/favorites', headers=other).json()['ids'] == []
    for _ in range(2):
        assert client.put('/api/v1/favorites/' + event_id, headers=user).status_code == 200
    assert client.get('/api/v1/favorites', headers=user).json()['ids'] == [event_id]
    assert client.get('/api/v1/favorites').status_code == 401
    background = client.get('/api/v1/events/' + event_id + '/background').json()
    assert background['entries'][0]['entry']['name'] == '核实后的歌手'
    assert background['artists'][0]['name'] == '核实后的歌手'
    assert background['references'][0]['url'] == 'https://example.com/event'
    assert len(session.exec(select(KnowledgeRevision)).all()) == 1
    assert client.post(url, headers=admin, json=body).status_code == 409
    client.delete('/api/v1/favorites/' + event_id, headers=user)
    assert client.get('/api/v1/favorites', headers=user).json()['ids'] == []

    monkeypatch.setattr(posters, 'recognize', lambda data: (b'image', '测试音乐节\n地点：长沙公园\n时间：2027年10月16日'))
    exact = client.post('/api/v1/posters', headers=user, json={'image_base64': base64.b64encode(b'another poster').decode()}).json()
    assert exact['auto_save_id'] == event_id
    assert client.get('/api/v1/favorites', headers=user).json()['ids'] == [event_id]
    client.delete('/api/v1/favorites/' + event_id, headers=user)
    assert client.get('/api/v1/posters/' + exact['id'], headers=user).json()['auto_save_id'] is None
    assert client.get('/api/v1/favorites', headers=user).json()['ids'] == []


def test_database_reconciliation_tracks_sources_and_rejects_ambiguity(review_client):
    client, session = review_client
    admin, _, _ = setup_review(client, session)
    place = {'kind':'place', 'name':'湖南国际会展中心芒果馆', 'note':'隔离测试场馆'}
    assert client.post('/api/v1/admin/entries',headers=admin,json=place).status_code == 200
    facts = {'name':'RAN HIPHOP','place':'长沙站 · 湖南国际会展中心苦果馆','artists':[]}
    corrected, changes, suggestions = reconcile(session,facts)
    assert corrected['place'] == '长沙站 · 湖南国际会展中心芒果馆'
    assert facts['place'].endswith('苦果馆')  # Original evidence untouched.
    assert changes[0]['source'] == '词条库匹配'
    from app.api.routes.knowledge import resolve_names
    assert resolve_names(session, corrected)[1]['entry']['name'] == place['name']
    assert client.post('/api/v1/admin/entries',headers=admin,json={**place,'name':'湖南国际会展中心甜果馆'}).status_code == 200
    corrected, changes, suggestions = reconcile(session,facts)
    assert corrected['place'] == facts['place']
    assert not changes and len(suggestions[0]['candidates']) == 2
    assert client.post('/api/v1/admin/entries',headers=admin,json={'kind':'person','name':'王以太','note':'测试短姓名'}).status_code == 200
    corrected, changes, suggestions = reconcile(session,{'artists':['王已太']})
    assert corrected['artists'] == ['王已太'] and not changes
    assert suggestions[0]['candidates'][0]['name'] == '王以太'
    assert client.get('/api/v1/entries?q=王已太').json()['items'][0]['name'] == '王以太'
