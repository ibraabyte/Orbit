"""The travel assistant, against a fake SerpApi. Every flight, hotel, price and key here is made up."""

from datetime import UTC, date, datetime, timedelta

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Document, Reminder, ServiceConnection, Task, TaskList, TaskStep
from app.security import decrypt_secret
from app.services import travel_api, trip_plan

KEY = "made-up-serpapi-key-0123456789"
DAY_OUT = date.today() + timedelta(days=40)
DAY_BACK = DAY_OUT + timedelta(days=5)

FLIGHTS = {
    "search_metadata": {"google_flights_url": "https://www.google.com/travel/flights?made-up=1"},
    "best_flights": [
        {
            "flights": [
                {
                    "departure_airport": {"name": "King Khalid International", "id": "RUH", "time": f"{DAY_OUT} 08:30"},
                    "arrival_airport": {"name": "Dubai International", "id": "DXB", "time": f"{DAY_OUT} 11:10"},
                    "duration": 100,
                    "airline": "Example Air",
                    "flight_number": "EX 101",
                }
            ],
            "total_duration": 100,
            "price": 980,
            "airline_logo": "https://example.com/logo.png",
        }
    ],
    "other_flights": [
        {
            "flights": [
                {
                    "departure_airport": {"id": "RUH", "time": f"{DAY_OUT} 22:00"},
                    "arrival_airport": {"id": "BAH", "time": f"{DAY_OUT} 23:05"},
                    "duration": 65,
                    "airline": "Sample Wings",
                    "flight_number": "SW 7",
                },
                {
                    "departure_airport": {"id": "BAH", "time": f"{DAY_OUT} 23:55"},
                    "arrival_airport": {"id": "DXB", "time": "not a time"},
                    "duration": 70,
                    "airline": "Sample Wings",
                    "flight_number": "SW 9",
                },
            ],
            "layovers": [{"id": "BAH", "name": "Bahrain International", "duration": 50}],
            "total_duration": 185,
            "price": 640,
        },
        {"flights": []},
        "junk",
    ],
    "price_insights": {"lowest_price": 640, "price_level": "low", "typical_price_range": [700, 1300]},
}

HOTELS = {
    "search_metadata": {"google_hotels_url": "https://www.google.com/travel/hotels?made-up=1"},
    "properties": [
        {
            "type": "hotel",
            "name": "Made-up Marina Hotel",
            "link": "https://example.com/marina",
            "extracted_hotel_class": 4,
            "overall_rating": 4.4,
            "reviews": 1200,
            "rate_per_night": {"lowest": "SAR 450", "extracted_lowest": 450},
            "total_rate": {"lowest": "SAR 2,250", "extracted_lowest": 2250},
            "images": [{"thumbnail": "https://example.com/t.jpg"}],
            "amenities": ["Free Wi-Fi", "Pool", 3],
            "check_in_time": "3:00 PM",
            "gps_coordinates": {"latitude": 25.08, "longitude": 55.14},
        },
        {"name": ""},
        {"type": "vacation rental", "name": "Sample Flat"},
    ],
}


class FakeSerpApi:
    def __init__(self) -> None:
        self.calls: list[httpx.Request] = []
        self.status = 200
        self.error: str | None = None

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        if self.error:
            return httpx.Response(self.status, json={"error": self.error})
        if request.url.params.get("api_key") != KEY:
            return httpx.Response(401, json={"error": "Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key"})
        if request.url.path == "/account.json":
            return httpx.Response(200, json={"plan_name": "Free Plan", "searches_per_month": 250, "total_searches_left": 247})
        engine = request.url.params.get("engine")
        return httpx.Response(200, json=FLIGHTS if engine == "google_flights" else HOTELS)


@pytest.fixture
def serpapi(monkeypatch: pytest.MonkeyPatch) -> FakeSerpApi:
    fake = FakeSerpApi()
    monkeypatch.setattr(travel_api, "transport", httpx.MockTransport(fake))
    return fake


def link(client: TestClient, auth: dict) -> None:
    response = client.put("/travel/key", json={"api_key": KEY}, headers=auth)
    assert response.status_code == 200, response.text


# --- the key ----------------------------------------------------------------------------------------------------


def test_overview_lists_airports_and_no_key(client: TestClient, auth: dict):
    body = client.get("/travel", headers=auth).json()
    assert body["key"] == {"connected": False, "connected_at": None}
    codes = {row["code"] for row in body["airports"]}
    assert {"RUH", "JED", "DXB", "IST"} <= codes
    assert next(row for row in body["airports"] if row["code"] == "JED")["city_ar"] == "جدة"


def test_key_is_checked_kept_encrypted_and_never_sent_back(client: TestClient, auth: dict, serpapi: FakeSerpApi, db: Session):
    bad = client.put("/travel/key", json={"api_key": "wrong-key-wrong-key-wrong"}, headers=auth)
    assert bad.status_code == 400
    assert "didn't accept" in bad.json()["detail"]

    response = client.put("/travel/key", json={"api_key": KEY}, headers=auth)
    assert response.status_code == 200
    assert response.json()["searches_left"] == 247
    assert response.json()["plan"] == "Free Plan"
    assert KEY not in response.text
    row = db.scalar(select(ServiceConnection).where(ServiceConnection.provider == "serpapi"))
    assert row is not None and row.api_key != KEY and decrypt_secret(row.api_key) == KEY
    assert KEY not in client.get("/travel", headers=auth).text
    assert client.get("/travel", headers=auth).json()["key"]["connected"] is True

    assert client.delete("/travel/key", headers=auth).status_code == 204
    assert client.get("/travel", headers=auth).json()["key"]["connected"] is False


def test_searching_without_a_key_asks_for_one(client: TestClient, auth: dict, serpapi: FakeSerpApi):
    response = client.post("/travel/flights", json={"origin": "RUH", "destination": "DXB", "depart_on": str(DAY_OUT)}, headers=auth)
    assert response.status_code == 409
    assert not serpapi.calls


# --- searching --------------------------------------------------------------------------------------------------


def test_round_trip_flights(client: TestClient, auth: dict, serpapi: FakeSerpApi):
    link(client, auth)
    response = client.post(
        "/travel/flights",
        json={
            "origin": "ruh",
            "destination": "DXB",
            "depart_on": str(DAY_OUT),
            "return_on": str(DAY_BACK),
            "adults": 2,
            "cabin": "business",
            "language": "ar",
        },
        headers=auth,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    sent = serpapi.calls[-1].url.params
    assert sent["engine"] == "google_flights"
    assert (sent["departure_id"], sent["arrival_id"], sent["type"], sent["travel_class"], sent["adults"]) == ("RUH", "DXB", "1", "3", "2")
    assert sent["return_date"] == str(DAY_BACK) and sent["hl"] == "ar" and sent["currency"] == "SAR"

    assert [f["price"] for f in body["flights"]] == [980, 640]
    best, other = body["flights"]
    assert best["best"] and best["stops"] == 0 and best["airline"] == "Example Air"
    assert best["departs"].startswith(f"{DAY_OUT}T08:30")
    assert other["stops"] == 1 and other["layovers"] == ["BAH"] and other["airline"] == "Sample Wings"
    assert other["arrives"] is None
    assert body["price_level"] == "low" and body["typical_range"] == [700, 1300]
    assert body["google_url"].startswith("https://www.google.com/travel/flights")


def test_one_way_and_bad_dates(client: TestClient, auth: dict, serpapi: FakeSerpApi):
    link(client, auth)
    response = client.post(
        "/travel/flights", json={"origin": "RUH", "destination": "JED", "depart_on": str(DAY_OUT), "stops": "nonstop"}, headers=auth
    )
    assert response.status_code == 200
    assert serpapi.calls[-1].url.params["type"] == "2" and "return_date" not in serpapi.calls[-1].url.params
    assert serpapi.calls[-1].url.params["stops"] == "1"

    searched = len(serpapi.calls)
    past = client.post(
        "/travel/flights", json={"origin": "RUH", "destination": "JED", "depart_on": str(date.today() - timedelta(days=1))}, headers=auth
    )
    assert past.status_code == 422
    back_first = client.post(
        "/travel/flights",
        json={"origin": "RUH", "destination": "JED", "depart_on": str(DAY_OUT), "return_on": str(DAY_OUT - timedelta(days=1))},
        headers=auth,
    )
    assert back_first.status_code == 422
    same = client.post("/travel/flights", json={"origin": "RUH", "destination": "ruh", "depart_on": str(DAY_OUT)}, headers=auth)
    assert same.status_code == 422
    assert len(serpapi.calls) == searched


def test_hotels(client: TestClient, auth: dict, serpapi: FakeSerpApi):
    link(client, auth)
    response = client.post(
        "/travel/hotels",
        json={"place": "Dubai Marina", "check_in": str(DAY_OUT), "check_out": str(DAY_BACK), "min_stars": 4, "sort": "price"},
        headers=auth,
    )
    assert response.status_code == 200, response.text
    sent = serpapi.calls[-1].url.params
    assert (sent["engine"], sent["q"], sent["hotel_class"], sent["sort_by"]) == ("google_hotels", "Dubai Marina", "4,5", "3")
    hotels = response.json()["hotels"]
    assert [h["name"] for h in hotels] == ["Made-up Marina Hotel", "Sample Flat"]
    assert hotels[0]["per_night"] == 450 and hotels[0]["total"] == 2250 and hotels[0]["stars"] == 4
    assert hotels[0]["amenities"] == ["Free Wi-Fi", "Pool"]
    assert hotels[1]["kind"] == "vacation rental" and hotels[1]["per_night"] is None

    zero = client.post("/travel/hotels", json={"place": "Dubai", "check_in": str(DAY_OUT), "check_out": str(DAY_OUT)}, headers=auth)
    assert zero.status_code == 422


def test_used_up_searches_and_service_errors(client: TestClient, auth: dict, serpapi: FakeSerpApi):
    link(client, auth)
    serpapi.status, serpapi.error = 429, "Your account has run out of searches."
    used_up = client.post("/travel/flights", json={"origin": "RUH", "destination": "DXB", "depart_on": str(DAY_OUT)}, headers=auth)
    assert used_up.status_code == 429
    assert "used up" in used_up.json()["detail"]
    serpapi.status, serpapi.error = 500, "Google hasn't returned any results for this query."
    failed = client.post("/travel/hotels", json={"place": "Nowhere", "check_in": str(DAY_OUT), "check_out": str(DAY_BACK)}, headers=auth)
    assert failed.status_code == 502


def test_unreachable(client: TestClient, auth: dict, serpapi: FakeSerpApi, monkeypatch: pytest.MonkeyPatch):
    link(client, auth)

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    monkeypatch.setattr(travel_api, "transport", httpx.MockTransport(down))
    response = client.post("/travel/flights", json={"origin": "RUH", "destination": "DXB", "depart_on": str(DAY_OUT)}, headers=auth)
    assert response.status_code == 502


# --- putting the trip in Tasks ----------------------------------------------------------------------------------


def trip_body(**changes) -> dict:
    body = {
        "place": "Dubai",
        "origin": "RUH",
        "destination": "DXB",
        "depart_on": str(DAY_OUT),
        "return_on": str(DAY_BACK),
        "flight": {
            "airline": "Example Air",
            "flight_numbers": ["EX 101"],
            "from_code": "RUH",
            "to_code": "DXB",
            "departs": f"{DAY_OUT}T08:30:00",
            "price": 980,
        },
        "hotel": {"name": "Made-up Marina Hotel", "per_night": 450, "total": 2250, "link": "https://example.com/marina"},
        "flights_url": "https://www.google.com/travel/flights?made-up=1",
    }
    return {**body, **changes}


def test_trip_becomes_a_task_list(client: TestClient, auth: dict, db: Session):
    response = client.post("/travel/trips", json=trip_body(), headers=auth)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["list_name"].startswith("Trip to Dubai, ")
    assert body["passport_warning"] is False

    tasks = {t.title: t for t in db.scalars(select(Task).where(Task.list_id == body["list_id"]))}
    assert len(tasks) == body["tasks"] == 7
    flight = tasks["Book the flight: Example Air · EX 101 · RUH → DXB"]
    assert flight.priority == "high" and "980 SAR" in flight.notes and "google.com/travel/flights" in flight.notes
    hotel = tasks["Book the hotel: Made-up Marina Hotel"]
    assert "450 SAR a night" in hotel.notes and "2,250 SAR in all" in hotel.notes
    assert "Check your passport is valid for the trip" in tasks
    assert "Check if you need a visa for Dubai" in tasks

    # 08:30 in Riyadh is 05:30 UTC: be there three hours early, check in a day before.
    leave = tasks["Leave for the airport (RUH)"]
    assert leave.due_at == datetime(DAY_OUT.year, DAY_OUT.month, DAY_OUT.day, 2, 30, tzinfo=UTC)
    assert leave.reminder_at == leave.due_at
    check_in = tasks["Check in online: Example Air · EX 101 · RUH → DXB"]
    assert check_in.due_at == datetime(DAY_OUT.year, DAY_OUT.month, DAY_OUT.day, 5, 30, tzinfo=UTC) - timedelta(days=1)
    pack = tasks["Pack for Dubai"]
    steps = [s.title for s in db.scalars(select(TaskStep).where(TaskStep.task_id == pack.id).order_by(TaskStep.position))]
    assert "Clothes for 5 nights" in steps
    # Every task with a time in the future gets its reminder.
    reminders = db.scalars(select(Reminder).where(Reminder.task_id.in_([t.id for t in tasks.values()]))).all()
    assert len(reminders) == 7


def test_trip_in_arabic_without_picks_and_within_the_country(client: TestClient, auth: dict, db: Session):
    body = trip_body(place="جدة", destination="JED", flight=None, hotel=None, language="ar")
    response = client.post("/travel/trips", json=body, headers=auth)
    assert response.status_code == 201, response.text
    assert response.json()["list_name"].startswith("رحلة جدة، ")
    titles = set(db.scalars(select(Task.title).where(Task.list_id == response.json()["list_id"])))
    assert "احجز الطيران إلى جدة" in titles
    assert "احجز مكان سكن في جدة" in titles
    assert "جهّز شنطة جدة" in titles
    # Riyadh to Jeddah: no visa task, and no airport times without a picked flight.
    assert not any("تأشيرة" in title or "المطار" in title for title in titles)


def test_passport_that_runs_out_too_soon(client: TestClient, auth: dict, me: dict, db: Session):
    user_id = client.get("/auth/me", headers=auth).json()["id"]
    db.add(Document(user_id=user_id, kind="passport", expires_on=DAY_BACK + timedelta(days=60)))
    # A family member's passport doesn't count for the user.
    db.add(Document(user_id=user_id, kind="passport", holder="Someone", expires_on=DAY_BACK + timedelta(days=2000)))
    db.commit()
    response = client.post("/travel/trips", json=trip_body(), headers=auth)
    assert response.json()["passport_warning"] is True
    titles = set(db.scalars(select(Task.title).where(Task.list_id == response.json()["list_id"])))
    assert "Renew your passport before the trip" in titles
    assert "Check your passport is valid for the trip" not in titles


def test_trips_are_per_user(client: TestClient, auth: dict, db: Session):
    from tests.conftest import bearer, sign_up

    client.post("/travel/trips", json=trip_body(), headers=auth)
    other = bearer(sign_up(client, "other@example.com"))
    lists = client.get("/task-lists", headers=other)
    assert lists.status_code == 200 and lists.json() == []
    assert db.scalar(select(TaskList.name)) is not None


def test_a_trip_link_must_be_https(client: TestClient, auth: dict):
    response = client.post("/travel/trips", json=trip_body(flights_url="javascript:alert(1)"), headers=auth)
    assert response.status_code == 422


def test_departure_needs_a_known_airport():
    flight = trip_plan.PickedFlight(
        airline="X", flight_numbers=[], from_code="ZZZ", to_code="DXB", departs=datetime(2026, 12, 5, 8, 30), price=None
    )
    assert trip_plan.departure_utc(flight) is None
    known = trip_plan.PickedFlight(
        airline="X", flight_numbers=[], from_code="LHR", to_code="RUH", departs=datetime(2026, 7, 1, 9, 0), price=None
    )
    assert trip_plan.departure_utc(known) == datetime(2026, 7, 1, 8, 0, tzinfo=UTC)


def test_month_math_for_the_passport_rule():
    assert trip_plan._months_after(date(2026, 8, 31), 6) == date(2027, 2, 28)
    assert trip_plan._months_after(date(2026, 3, 15), 6) == date(2026, 9, 15)
