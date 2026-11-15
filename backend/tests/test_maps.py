"""Leave-time alerts and place search, against a fake Google Maps. Every key, place and time here is made up."""

import json
from datetime import UTC, date, datetime, time, timedelta, timezone

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import ServiceConnection
from app.routers import assistant as assistant_router
from app.security import decrypt_secret
from app.services import leave_times, maps_api

KEY = "made-up-google-maps-key-0001"
DAY = date(2026, 11, 20)
RIYADH = timezone(timedelta(hours=3))
NOW = datetime.combine(DAY, time(8, 0), RIYADH)
HOME = {"lat": 24.70, "lng": 46.68}
PLACE_ID = "ChIJmadeUpClinic001"


def at(hour: int, minute: int = 0) -> datetime:
    return datetime.combine(DAY, time(hour, minute), RIYADH)


class FakeGoogle:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict, dict]] = []
        self.key_ok = True
        self.places_on = True
        # Seconds for a drive leaving now, and for one leaving at a set time (traffic then).
        self.now_seconds = "1500s"
        self.later_seconds = "2100s"
        self.no_route = False

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.calls.append((request.url.host, dict(request.headers), body))
        if request.headers.get("x-goog-api-key") != KEY or not self.key_ok:
            return httpx.Response(
                400,
                json={"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT"}},
            )
        if request.url.host == "places.googleapis.com":
            if not self.places_on:
                message = "Places API (New) has not been used in project 123 before or it is disabled."
                return httpx.Response(403, json={"error": {"code": 403, "message": message, "status": "PERMISSION_DENIED"}})
            return httpx.Response(200, json={"places": [
                {"id": PLACE_ID, "displayName": {"text": "Made-up Clinic"}, "formattedAddress": "1 Example St, Riyadh"},
                {"id": "bad id with spaces", "displayName": {"text": "Skipped"}},
            ]})  # fmt: skip
        if self.no_route:
            return httpx.Response(200, json={})
        seconds = self.later_seconds if "departureTime" in body or "arrivalTime" in body else self.now_seconds
        return httpx.Response(200, json={"routes": [{"duration": seconds, "distanceMeters": 12_400}]})

    def routes(self) -> list[dict]:
        return [body for host, _, body in self.calls if host == "routes.googleapis.com"]


@pytest.fixture
def google(monkeypatch: pytest.MonkeyPatch) -> FakeGoogle:
    fake = FakeGoogle()
    monkeypatch.setattr(maps_api, "transport", httpx.MockTransport(fake))
    monkeypatch.setattr(leave_times, "utc_now", lambda: NOW.astimezone(UTC))
    monkeypatch.setattr(assistant_router, "utc_today", lambda: DAY)
    leave_times.clear_cache()
    return fake


def riyadh(client: TestClient, auth: dict) -> None:
    assert client.patch("/profile", json={"timezone": "Asia/Riyadh"}, headers=auth).status_code == 200


def link(client: TestClient, auth: dict) -> None:
    response = client.put("/maps/key", headers=auth, json={"api_key": KEY})
    assert response.status_code == 200, response.text


def task(client: TestClient, auth: dict, title: str, due: datetime, **fields) -> dict:
    response = client.post("/tasks", headers=auth, json={"title": title, "due_at": due.isoformat(), **fields})
    assert response.status_code == 201, response.text
    return response.json()


def test_the_key_is_checked_with_both_apis_and_kept_encrypted(client: TestClient, auth: dict, google: FakeGoogle, db: Session, me: dict):
    assert client.get("/maps", headers=auth).json()["connected"] is False
    google.key_ok = False
    refused = client.put("/maps/key", headers=auth, json={"api_key": KEY})
    assert refused.status_code == 400 and "refused the key" in refused.json()["detail"]
    google.key_ok, google.places_on = True, False
    no_places = client.put("/maps/key", headers=auth, json={"api_key": KEY})
    assert no_places.status_code == 400 and "Places API (New) is not turned on" in no_places.json()["detail"]
    google.places_on = True
    link(client, auth)
    row = db.get(ServiceConnection, (me["user_id"], "google_maps"))
    assert row and row.api_key != KEY and decrypt_secret(row.api_key) == KEY
    assert KEY not in json.dumps(client.get("/maps", headers=auth).json())
    assert client.delete("/maps/key", headers=auth).status_code == 204
    assert client.get("/maps", headers=auth).json()["connected"] is False
    assert client.put("/maps/key", headers=auth, json={"api_key": "short"}).status_code == 422


def test_place_search_needs_a_key_and_keeps_only_clean_ids(client: TestClient, auth: dict, google: FakeGoogle):
    assert client.post("/maps/places", headers=auth, json={"query": "clinic"}).status_code == 409
    link(client, auth)
    found = client.post("/maps/places", headers=auth, json={"query": "clinic", "near": HOME, "locale": "ar"}).json()
    assert found == [{"id": PLACE_ID, "name": "Made-up Clinic", "address": "1 Example St, Riyadh"}]
    _, headers, body = google.calls[-1]
    assert body["languageCode"] == "ar" and body["locationBias"]["circle"]["center"] == {"latitude": 24.70, "longitude": 46.68}
    assert headers["x-goog-fieldmask"] == "places.id,places.displayName,places.formattedAddress"


def test_a_task_keeps_its_place_and_clearing_the_name_clears_the_google_place(client: TestClient, auth: dict):
    row = task(client, auth, "Dentist", at(16), place_name="  Made-up Clinic ", place_id=PLACE_ID)
    assert row["place_name"] == "Made-up Clinic" and row["place_id"] == PLACE_ID
    assert client.post("/tasks", headers=auth, json={"title": "x", "place_id": "has spaces"}).status_code == 422
    cleared = client.patch(f"/tasks/{row['id']}", headers=auth, json={"place_name": None}).json()
    assert cleared["place_name"] is None and cleared["place_id"] is None


def test_leave_time_uses_traffic_at_the_moment_of_leaving(client: TestClient, auth: dict, google: FakeGoogle):
    riyadh(client, auth)
    link(client, auth)
    google.calls.clear()
    dentist = task(client, auth, "Dentist", at(16), place_name="Made-up Clinic", place_id=PLACE_ID)
    task(client, auth, "Typed address", at(8, 45), place_name="5 Example Rd, Riyadh")
    task(client, auth, "No place", at(11))
    task(client, auth, "Date only", datetime.combine(DAY, time(0, 0), RIYADH) + timedelta(days=1), place_name="Somewhere")
    task(client, auth, "Past", at(7), place_name="Somewhere")
    reply = client.post("/maps/leave", headers=auth, json={"origin": HOME, "buffer_minutes": 5}).json()
    near, later = reply["items"]
    # 08:45, 25 min away (+5): leave 08:15, too soon to ask again.
    assert near["title"] == "Typed address" and near["travel_minutes"] == 25 and near["status"] == "ok"
    assert datetime.fromisoformat(near["leave_at"]) == at(8, 15)
    # 16:00: asked again for 15:30, when traffic says 35 min: leave 15:20.
    assert later["task_id"] == dentist["id"] and later["travel_minutes"] == 35 and later["meters"] == 12_400
    assert datetime.fromisoformat(later["leave_at"]) == at(15, 20)
    routes = google.routes()
    assert routes[0]["destination"] == {"address": "5 Example Rd, Riyadh"} and routes[0]["routingPreference"] == "TRAFFIC_AWARE"
    assert routes[1]["destination"] == {"placeId": PLACE_ID} and "departureTime" not in routes[1]
    assert routes[2]["departureTime"] == "2026-11-20T12:30:00Z"
    assert routes[0]["origin"] == {"location": {"latLng": {"latitude": 24.70, "longitude": 46.68}}}
    # The same look again comes from memory, not Google.
    client.post("/maps/leave", headers=auth, json={"origin": HOME, "buffer_minutes": 5})
    assert len(google.routes()) == 3


def test_late_no_route_walking_and_transit(client: TestClient, auth: dict, google: FakeGoogle):
    riyadh(client, auth)
    link(client, auth)
    task(client, auth, "Soon", at(8, 20), place_name="Made-up Cafe")
    [late] = client.post("/maps/leave", headers=auth, json={"origin": HOME}).json()["items"]
    assert late["status"] == "late" and datetime.fromisoformat(late["leave_at"]) == at(7, 45)
    leave_times.clear_cache()
    google.no_route = True
    [lost] = client.post("/maps/leave", headers=auth, json={"origin": HOME}).json()["items"]
    assert lost["status"] == "no_route" and lost["leave_at"] is None
    google.no_route = False
    google.calls.clear()
    client.post("/maps/leave", headers=auth, json={"origin": HOME, "mode": "walk"})
    [walk] = google.routes()
    assert walk["travelMode"] == "WALK" and "routingPreference" not in walk and "departureTime" not in walk
    client.post("/maps/leave", headers=auth, json={"origin": HOME, "mode": "transit"})
    assert google.routes()[-1]["arrivalTime"] == "2026-11-20T05:20:00Z"


def test_a_rejected_key_while_timing_says_so(client: TestClient, auth: dict, google: FakeGoogle):
    riyadh(client, auth)
    link(client, auth)
    task(client, auth, "Dentist", at(16), place_name="Made-up Clinic")
    google.key_ok = False
    failed = client.post("/maps/leave", headers=auth, json={"origin": HOME})
    assert failed.status_code == 400 and "refused the key" in failed.json()["detail"]
    assert client.post("/maps/leave", headers=auth, json={"origin": {"lat": 120, "lng": 0}}).status_code == 422


def test_the_day_plan_sets_the_way_there_before_the_appointment(client: TestClient, auth: dict, google: FakeGoogle):
    riyadh(client, auth)
    dentist = task(client, auth, "Dentist", at(16), place_name="Made-up Clinic", place_id=PLACE_ID)
    body = {"date": DAY.isoformat(), "locale": "en", "now": "08:00", "prayers": [], "origin": HOME, "buffer_minutes": 10}
    # A place makes it an appointment even without a reminder; without a key there is no travel block.
    blocks = client.post("/assistant/day/draft", headers=auth, json=body).json()["blocks"]
    assert [(b["kind"], b["start"]) for b in blocks] == [("appointment", "16:00")] and blocks[0]["task_id"] == dentist["id"]
    link(client, auth)
    blocks = client.post("/assistant/day/draft", headers=auth, json=body).json()["blocks"]
    # 35 min of traffic at 15:15 plus 10 to spare.
    assert [(b["kind"], b["start"], b["end"], b["title"]) for b in blocks] == [
        ("travel", "15:15", "16:00", "Made-up Clinic"),
        ("appointment", "16:00", "16:30", "Dentist"),
    ]
    # Google down: the plan still comes, without the way there.
    leave_times.clear_cache()
    google.key_ok = False
    blocks = client.post("/assistant/day/draft", headers=auth, json=body).json()["blocks"]
    assert [b["kind"] for b in blocks] == ["appointment"]
    # Without a position nothing is asked.
    google.calls.clear()
    client.post("/assistant/day/draft", headers=auth, json={**body, "origin": None})
    assert google.calls == []


def test_a_repeating_appointment_keeps_its_place(client: TestClient, auth: dict):
    row = task(client, auth, "Physio", at(16), place_name="Made-up Clinic", place_id=PLACE_ID, recurrence="weekly")
    following = client.post(f"/tasks/{row['id']}/complete", headers=auth).json()["next_task"]
    assert following["place_name"] == "Made-up Clinic" and following["place_id"] == PLACE_ID
