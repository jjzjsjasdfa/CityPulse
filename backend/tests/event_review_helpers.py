from tests.test_candidate_publication import approval, setup_review


def published(client, session):
    headers, source, item = setup_review(client, session)
    candidate = client.get("/api/v1/admin/candidates", headers=headers).json()[0]
    result = client.post(
        f"/api/v1/admin/candidates/{candidate['id']}/approve",
        headers=headers,
        json=approval(candidate),
    )
    assert result.status_code == 200, result.text
    event_id = result.json()["event_id"]
    return headers, source, item, candidate, event_id


def edit_body(client, event_id, headers, **changes):
    event = client.get(f"/api/v1/admin/events/{event_id}", headers=headers).json()
    event.pop("id")
    event["expected_updated_at"] = event.pop("updated_at")
    return {**event, "review_note": "Verified management change", **changes}
