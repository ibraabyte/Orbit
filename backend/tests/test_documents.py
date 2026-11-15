"""Official papers and when they expire. Names and dates are made up."""

from fastapi.testclient import TestClient

from tests.conftest import bearer, sign_up


def add(client: TestClient, auth: dict, **body) -> dict:
    response = client.post("/documents", headers=auth, json={"kind": "passport", "expires_on": "2027-03-01", **body})
    assert response.status_code == 201, response.text
    return response.json()


def test_needs_sign_in(client: TestClient):
    assert client.get("/documents").status_code == 401
    assert client.post("/documents", json={"kind": "passport", "expires_on": "2027-03-01"}).status_code == 401


def test_a_paper_with_the_usual_heads_ups(client: TestClient, auth: dict):
    row = add(client, auth)
    assert row["kind"] == "passport" and row["expires_on"] == "2027-03-01"
    assert row["remind_days"] == [30, 7, 0] and row["name"] is None and row["holder"] is None
    # Heads-ups are kept once each, furthest first; blank text is not set.
    other = add(client, auth, kind="iqama", remind_days=[0, 60, 14, 14], holder="  Sara ", notes="  ")
    assert other["remind_days"] == [60, 14, 0] and other["holder"] == "Sara" and other["notes"] is None


def test_soonest_to_expire_first(client: TestClient, auth: dict):
    add(client, auth, expires_on="2028-01-01")
    add(client, auth, kind="national_id", expires_on="2026-12-01")
    add(client, auth, kind="driving_license", expires_on="2027-06-01")
    kinds = [row["kind"] for row in client.get("/documents", headers=auth).json()]
    assert kinds == ["national_id", "driving_license", "passport"]


def test_bad_papers_are_refused(client: TestClient, auth: dict):
    bad = [
        {"kind": "library_card"},
        {"kind": "other"},
        {"kind": "other", "name": "   "},
        {"expires_on": "soon"},
        {"remind_days": []},
        {"remind_days": [1, 2, 3, 4, 5]},
        {"remind_days": [-1]},
        {"remind_days": [400]},
        {"holder": "x" * 61},
        {"number": "1234567890"},
    ]
    for body in bad:
        response = client.post("/documents", headers=auth, json={"kind": "passport", "expires_on": "2027-03-01", **body})
        assert response.status_code == 422, body
    assert add(client, auth, kind="other", name="Gym membership")["name"] == "Gym membership"


def test_renewing_moves_the_expiry(client: TestClient, auth: dict):
    row = add(client, auth, kind="iqama", expires_on="2026-11-20")
    response = client.patch(f"/documents/{row['id']}", headers=auth, json={"expires_on": "2027-11-20", "remind_days": [60, 0]})
    assert response.status_code == 200, response.text
    assert response.json()["expires_on"] == "2027-11-20" and response.json()["remind_days"] == [60, 0]
    # An "other" paper keeps its name: clearing it is refused by the database.
    named = add(client, auth, kind="other", name="Club card")
    assert client.patch(f"/documents/{named['id']}", headers=auth, json={"name": None}).status_code == 422
    assert client.patch(f"/documents/{row['id']}", headers=auth, json={"expires_on": None}).status_code == 422


def test_only_the_owner_sees_or_changes_a_paper(client: TestClient, auth: dict):
    row = add(client, auth)
    other = bearer(sign_up(client, "other@example.com"))
    assert client.get("/documents", headers=other).json() == []
    assert client.patch(f"/documents/{row['id']}", headers=other, json={"expires_on": "2030-01-01"}).status_code == 404
    assert client.delete(f"/documents/{row['id']}", headers=other).status_code == 404
    assert client.delete(f"/documents/{row['id']}", headers=auth).status_code == 204
    assert client.get("/documents", headers=auth).json() == []


def test_papers_reach_the_dashboard_and_the_export(client: TestClient, auth: dict):
    add(client, auth)
    assert [row["kind"] for row in client.get("/dashboard", headers=auth).json()["documents"]] == ["passport"]
    assert len(client.get("/export", headers=auth).json()["documents"]) == 1


def test_documents_is_a_section_that_can_be_switched_off(client: TestClient, auth: dict):
    response = client.patch("/profile", headers=auth, json={"hidden_sections": ["documents"]})
    assert response.status_code == 200, response.text
    assert response.json()["hidden_sections"] == ["documents"]
