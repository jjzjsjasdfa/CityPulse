import base64
import os

import pytest
from sqlmodel import select

from app.api.routes import posters
from app.models import PosterSubmission
from tests.test_candidate_publication import review_client, setup_review  # noqa: F401

pytestmark = pytest.mark.skipif(os.getenv("CITYPULSE_TEST_POSTGRES") != "1", reason="PostGIS integration")


def test_upload_permissions_duplicate_review_and_artist_link(review_client, monkeypatch):
    client, session = review_client
    admin, _, _ = setup_review(client, session)
    credentials = {"email": "poster-reader@example.com", "password": "test-poster-password"}
    assert client.post("/api/v1/auth/register", json=credentials).status_code == 201
    user = {"Authorization": "Bearer " + client.post("/api/v1/auth/login", json=credentials).json()["access_token"]}
    monkeypatch.setattr(posters, "recognize", lambda data: (b"image", "测试音乐节\n阵容：测试歌手\n地点：长沙\n时间：2027年10月16日"))
    body = {"image_base64": base64.b64encode(b"test image").decode()}
    assert client.post("/api/v1/posters", json=body).status_code == 401
    assert client.post("/api/v1/admin/artists", headers=user, json={"name": "测试歌手"}).status_code == 403
    artist = client.post("/api/v1/admin/artists", headers=admin, json={"name": "测试歌手", "references": [{"label": "核实来源", "url": "https://example.com/artist"}]}).json()
    response = client.post("/api/v1/posters", headers=user, json=body)
    assert response.status_code == 200, response.text
    row = response.json()
    assert 'raw_text' not in row
    assert '_pipeline' not in row['extracted']
    assert row['warning'] == '识别内容可能不准确，请以官方公告为准。'
    assert row["artists"][0]["id"] == artist["id"]
    assert row["auto_save_id"] is None
    assert client.post("/api/v1/posters", headers=user, json=body).json()["id"] == row["id"]
    assert len(session.exec(select(PosterSubmission)).all()) == 1
    assert client.get(f"/api/v1/posters/{row['id']}", headers=admin).status_code == 404
    assert client.get(f"/api/v1/admin/posters/{row['id']}/image", headers=user).status_code == 403
    assert client.get(f"/api/v1/admin/posters/{row['id']}", headers=user).status_code == 403
    assert client.get(f"/api/v1/admin/posters/{row['id']}").status_code == 401
    assert '测试音乐节' in client.get(f"/api/v1/admin/posters/{row['id']}", headers=admin).json()['raw_text']
    assert 'raw_text' not in client.get(f"/api/v1/posters/{row['id']}", headers=user).json()
    event = {"name": "测试音乐节", "category": "festival", "summary": "测试", "description": "测试活动",
             "starts_at": "2027-10-16T12:00:00+08:00", "ends_at": "2027-10-16T22:00:00+08:00",
             "venue_name": "长沙公园", "address": "长沙公园", "city": "长沙", "district": "天心区",
             "latitude": 28.2, "longitude": 112.9, "organizer": "测试主办方", "status": "announced",
             "evidence_url": "https://example.com/event"}
    review = {"approve": True, "note": "核实完毕", "new_event": event, "artist_ids": [artist["id"]]}
    approved = client.post(f"/api/v1/admin/posters/{row['id']}/review", headers=admin, json=review)
    assert approved.status_code == 200, approved.text
    event_id = approved.json()["event_id"]
    assert client.get(f"/api/v1/events/{event_id}").status_code == 200
    assert client.get(f"/api/v1/events/{event_id}/background").json()["artists"][0]["id"] == artist["id"]
    assert client.post(f"/api/v1/admin/posters/{row['id']}/review", headers=admin, json=review).status_code == 409
    assert client.get("/api/v1/posters", headers=user).json()[0]["status"] == "approved"
