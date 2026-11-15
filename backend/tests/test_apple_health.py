"""Apple Health days sent by the phone: saved per user, replaced on re-sync, never seen by another account."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from tests.conftest import bearer, sign_up


def test_days_replace_and_stay_with_their_owner(client: TestClient, auth: dict[str, str]) -> None:
    assert client.get("/apple-health/status", headers=auth).json() == {"connected": False, "last_synced_at": None}

    today = date.today()
    yesterday = (today - timedelta(days=1)).isoformat()
    first = {"days": [{"date": yesterday, "steps": 5000, "sleep_minutes": 400}, {"date": today.isoformat(), "steps": 1200}]}
    saved = client.put("/apple-health/days", json=first, headers=auth)
    assert saved.status_code == 200, saved.text
    assert saved.json()["connected"] is True

    # A re-sync replaces the whole day: steps change, the missing sleep becomes empty.
    client.put("/apple-health/days", json={"days": [{"date": yesterday, "steps": 6100}]}, headers=auth)
    days = client.get("/apple-health/days?days=7", headers=auth).json()
    assert [(day["date"], day["steps"], day["sleep_minutes"]) for day in days] == [(yesterday, 6100, None), (today.isoformat(), 1200, None)]

    other = bearer(sign_up(client, email="other@example.com"))
    assert client.get("/apple-health/days", headers=other).json() == []
    assert client.get("/integrations", headers=other).json()["apple_health"]["connected"] is False
    assert client.get("/integrations", headers=auth).json()["apple_health"]["connected"] is True

    assert client.delete("/apple-health", headers=auth).status_code == 204
    assert client.get("/apple-health/days", headers=auth).json() == []


def test_bad_days_are_refused(client: TestClient, auth: dict[str, str]) -> None:
    future = (date.today() + timedelta(days=3)).isoformat()
    assert client.put("/apple-health/days", json={"days": [{"date": future, "steps": 1}]}, headers=auth).status_code == 422
    negative = {"days": [{"date": date.today().isoformat(), "steps": -5}]}
    assert client.put("/apple-health/days", json=negative, headers=auth).status_code == 422
    assert client.get("/apple-health/status").status_code == 401
