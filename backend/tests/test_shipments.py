"""The order tracker, against a fake 17TRACK and a fake Gmail. Every number, shop and email here is made up."""

import base64
import json
from datetime import UTC, date, datetime, timedelta

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import GmailConnection, ServiceConnection, Shipment
from app.security import decrypt_secret, encrypt_secret
from app.services import gmail_api, tracking_api
from app.services import shipments as tracker

KEY = "made-up-17track-key"
TODAY = date(2026, 11, 15)
NOW = datetime(2026, 11, 15, 9, 0, tzinfo=UTC)


# --- finding numbers in emails ---------------------------------------------------------------------------------


def test_numbers_after_tracking_words_in_english_and_arabic():
    assert tracker.find_numbers("Your order has shipped. Tracking number: 3412 0987 65") == []  # spaces split it: not guessed
    assert tracker.find_numbers("Your order has shipped. Tracking number: 34120987651") == ["34120987651"]
    assert tracker.find_numbers("AWB # 290123456781 via SMSA") == ["290123456781"]
    assert tracker.find_numbers("تم شحن طلبك، رقم التتبع: ٥٥٤٤٣٣٢٢١١٠") == ["55443322110"]
    assert tracker.find_numbers("رقم الشحنة SA-2026-88123 في الطريق") == ["SA202688123"]
    assert tracker.find_numbers("Track it: RR123456789SA and again RR123456789SA") == ["RR123456789SA"]
    assert tracker.find_numbers("UPS 1Z999AA10123456784 and J&T JT0001234567890") == ["1Z999AA10123456784", "JT0001234567890"]


def test_order_numbers_prices_and_phone_lookalikes_are_left_alone():
    assert tracker.find_numbers("Order #402-1234567-7654321 confirmed. Total SAR 199.00") == []
    assert tracker.find_numbers("Tracking will be shared soon") == []
    assert tracker.find_numbers("tracking number: 0000000000") == []
    assert tracker.find_numbers("tracking id: SHOPNOW") == []


def test_shop_name_from_the_sender():
    assert tracker.store_name("Noon", "noon.com") == "Noon"
    assert tracker.store_name("no-reply", "amazon.sa") == "Amazon"
    assert tracker.store_name("", "mail.shop-example.com") == "Shop-example"


def test_first_look_reaches_back_three_weeks_and_later_ones_start_after_the_last():
    assert tracker.gmail_query(None).startswith("newer_than:21d (")
    assert tracker.gmail_query(datetime(2026, 11, 14, tzinfo=UTC)).startswith("after:1794614400 (")
    assert '"رقم التتبع"' in tracker.gmail_query(None)


# --- flags and alerts -------------------------------------------------------------------------------------------


def shipment(**fields) -> Shipment:
    base = {"number": "RR123456789SA", "status": "in_transit", "registered": True, "archived": False, "created_at": NOW - timedelta(days=3)}
    return Shipment(**{**base, **fields})


def test_late_stuck_and_problems():
    assert tracker.flags(shipment(eta_on=date(2026, 11, 14)), TODAY, NOW) == ["late"]
    assert tracker.flags(shipment(eta_on=date(2026, 11, 16), last_event_at=NOW - timedelta(days=7)), TODAY, NOW) == []
    assert tracker.flags(shipment(last_event_at=NOW - timedelta(days=7)), TODAY, NOW) == ["stuck"]
    assert tracker.flags(shipment(status="failed"), TODAY, NOW) == ["problem"]
    assert tracker.flags(shipment(status="not_found", created_at=NOW - timedelta(days=8)), TODAY, NOW) == ["no_info"]
    assert tracker.flags(shipment(status="delivered", eta_on=date(2026, 11, 1)), TODAY, NOW) == []


def test_each_alert_is_announced_once():
    row = shipment(status="out_for_delivery")
    assert tracker.pending_alert(row, TODAY, NOW) == "out_for_delivery"
    row.alert_seen = "out_for_delivery"
    assert tracker.pending_alert(row, TODAY, NOW) is None
    row.status = "delivered"
    assert tracker.pending_alert(row, TODAY, NOW) == "delivered"
    assert tracker.pending_alert(shipment(eta_on=date(2026, 11, 10)), TODAY, NOW) == "late"
    assert tracker.pending_alert(shipment(), TODAY, NOW) is None


# --- 17TRACK answers --------------------------------------------------------------------------------------------


def info(number: str, status: str, events: list[tuple[str, str, str]], eta: str | None = None, carrier: str = "Saudi Post") -> dict:
    return {
        "number": number,
        "carrier": 21051,
        "track_info": {
            "latest_status": {"status": status, "sub_status": f"{status}_Other"},
            "time_metrics": {"estimated_delivery_date": {"from": None, "to": eta}},
            "tracking": {
                "providers": [
                    {
                        "provider": {"key": 21051, "name": carrier},
                        "events": [{"time_utc": at, "time_iso": at, "description": text, "location": place} for at, text, place in events],
                    }
                ]
            },
        },
    }


def test_parse_track_info():
    parsed = tracking_api.parse_info(
        info(
            "rr123456789sa",
            "InTransit",
            [("2026-11-13T08:00:00Z", "Arrived at sorting center", "Riyadh"), ("2026-11-14T10:30:00Z", "  Left the   facility ", "Riyadh")],
            eta="2026-11-17T00:00:00+03:00",
        )
    )
    assert parsed and parsed.number == "RR123456789SA" and parsed.status == "in_transit"
    assert parsed.carrier_name == "Saudi Post" and parsed.carrier_code == 21051
    assert parsed.eta_on == date(2026, 11, 17)
    assert [e.text for e in parsed.events] == ["Left the facility", "Arrived at sorting center"]
    assert tracking_api.parse_info({"number": "X1", "track_info": {"latest_status": {"status": "Weird"}}}).status == "not_found"


class Fake17Track:
    """register / gettrackinfo / getquota / deletetrack, with a list of what was asked."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, list | dict]] = []
        self.answers: dict[str, dict] = {}
        self.registered: set[str] = set()
        self.reject: dict[str, tuple[int, str]] = {}
        self.key_ok = True

    def __call__(self, request: httpx.Request) -> httpx.Response:
        name = request.url.path.rsplit("/", 1)[1]
        body = json.loads(request.content or b"null")
        self.calls.append((name, body))
        if request.headers.get("17token") != KEY or not self.key_ok:
            return httpx.Response(401, json={"code": 401})
        if name == "getquota":
            return httpx.Response(200, json={"code": 0, "data": {"quota_total": 100, "quota_used": 3, "quota_remain": 97}})
        accepted, rejected = [], []
        for item in body:
            number = item["number"]
            if number in self.reject:
                code, message = self.reject[number]
                rejected.append({"number": number, "error": {"code": code, "message": message}})
            elif name == "register":
                if number in self.registered:
                    rejected.append({"number": number, "error": {"code": tracking_api.ALREADY_REGISTERED, "message": "registered"}})
                else:
                    self.registered.add(number)
                    accepted.append({"number": number, "carrier": 21051})
            elif name == "gettrackinfo":
                if number not in self.registered:
                    rejected.append({"number": number, "error": {"code": tracking_api.NOT_REGISTERED, "message": "not registered"}})
                else:
                    accepted.append(self.answers.get(number) or {"number": number, "track_info": {"latest_status": {"status": "NotFound"}}})
            else:
                self.registered.discard(number)
                accepted.append({"number": number})
        return httpx.Response(200, json={"code": 0, "data": {"accepted": accepted, "rejected": rejected}})

    def asked(self, name: str) -> list[str]:
        return [item["number"] for call, body in self.calls if call == name for item in body]


@pytest.fixture
def track(monkeypatch: pytest.MonkeyPatch) -> Fake17Track:
    fake = Fake17Track()
    monkeypatch.setattr(tracking_api, "transport", httpx.MockTransport(fake))
    return fake


def link_key(client: TestClient, auth: dict) -> dict:
    response = client.put("/shipments/tracking", headers=auth, json={"api_key": KEY})
    assert response.status_code == 200, response.text
    return response.json()


def test_the_key_is_checked_and_kept_encrypted(client: TestClient, auth: dict, track: Fake17Track, db: Session, me: dict):
    track.key_ok = False
    refused = client.put("/shipments/tracking", headers=auth, json={"api_key": KEY})
    assert refused.status_code == 400 and "17TRACK refused the key" in refused.json()["detail"]
    track.key_ok = True
    linked = link_key(client, auth)
    assert linked["connected"] is True and linked["credits_left"] == 97
    row = db.get(ServiceConnection, (me["user_id"], "17track"))
    assert row and row.api_key != KEY and decrypt_secret(row.api_key) == KEY
    assert KEY not in json.dumps(client.get("/shipments", headers=auth).json())
    assert client.delete("/shipments/tracking", headers=auth).status_code == 204
    assert client.get("/shipments", headers=auth).json()["tracking"]["connected"] is False


def test_add_without_a_key_waits_then_is_tracked_once_linked(client: TestClient, auth: dict, track: Fake17Track):
    added = client.post("/shipments", headers=auth, json={"number": " rr-123456789-sa ", "label": "Headphones"})
    assert added.status_code == 201, added.text
    row = added.json()
    assert row["number"] == "RR123456789SA" and row["status"] == "pending" and row["registered"] is False
    assert track.calls == []
    assert client.post("/shipments", headers=auth, json={"number": "RR123456789SA"}).status_code == 409
    assert client.post("/shipments", headers=auth, json={"number": "not a number!"}).status_code == 422

    track.answers["RR123456789SA"] = info(
        "RR123456789SA", "InTransit", [("2026-11-14T10:30:00Z", "Left the facility", "Riyadh")], eta="2026-11-18"
    )
    link_key(client, auth)
    [found] = client.get("/shipments", headers=auth).json()["shipments"]
    assert found["registered"] and found["status"] == "in_transit" and found["carrier_name"] == "Saudi Post"
    assert found["last_event"] == "Left the facility" and found["last_location"] == "Riyadh" and found["eta_on"] == "2026-11-18"
    assert found["events"][0]["text"] == "Left the facility"
    assert track.asked("register") == ["RR123456789SA"]


def test_refresh_reads_without_registering_again_and_announces_delivery_once(client: TestClient, auth: dict, track: Fake17Track):
    link_key(client, auth)
    track.answers["JT0001234567890"] = info(
        "JT0001234567890", "OutForDelivery", [("2026-11-15T06:00:00Z", "With the courier", "Jeddah")], carrier="J&T"
    )
    shipment_id = client.post("/shipments", headers=auth, json={"number": "JT0001234567890"}).json()["id"]
    [row] = client.get("/shipments", headers=auth).json()["shipments"]
    assert row["alert"] == "out_for_delivery"
    assert client.post("/shipments/seen", headers=auth, json={"ids": [shipment_id]}).status_code == 204
    assert client.get("/shipments", headers=auth).json()["shipments"][0]["alert"] is None

    track.answers["JT0001234567890"] = info(
        "JT0001234567890", "Delivered", [("2026-11-15T11:00:00Z", "Delivered", "Jeddah")], carrier="J&T"
    )
    overview = client.post("/shipments/refresh", headers=auth).json()
    [row] = overview["shipments"]
    assert row["status"] == "delivered" and row["delivered_at"].startswith("2026-11-15T11:00") and row["alert"] == "delivered"
    assert track.asked("register") == ["JT0001234567890"]
    assert track.asked("gettrackinfo") == ["JT0001234567890", "JT0001234567890"]
    # Delivered: not asked about again.
    client.post("/shipments/refresh", headers=auth)
    assert len(track.asked("gettrackinfo")) == 2


def test_a_shipment_already_delivered_when_added_is_not_news(client: TestClient, auth: dict, track: Fake17Track):
    link_key(client, auth)
    track.answers["RR987654321SA"] = info("RR987654321SA", "Delivered", [("2026-11-01T11:00:00Z", "Delivered", "Dammam")])
    row = client.post("/shipments", headers=auth, json={"number": "RR987654321SA"}).json()
    assert row["status"] == "delivered" and row["alert"] is None


def test_rejected_numbers_keep_the_reason(client: TestClient, auth: dict, track: Fake17Track):
    link_key(client, auth)
    track.reject["12345678901"] = (-18019903, "The carrier cannot be detected.")
    row = client.post("/shipments", headers=auth, json={"number": "12345678901"}).json()
    assert row["registered"] is False and row["error"] == "The carrier cannot be detected."


def test_a_wrong_key_later_shows_on_the_overview(client: TestClient, auth: dict, track: Fake17Track):
    link_key(client, auth)
    client.post("/shipments", headers=auth, json={"number": "RR123456789SA"})
    track.key_ok = False
    overview = client.post("/shipments/refresh", headers=auth).json()
    assert "17TRACK refused the key" in overview["tracking"]["last_error"]


def test_hide_rename_delete_and_only_your_own(client: TestClient, auth: dict, track: Fake17Track):
    from tests.conftest import bearer, sign_up

    link_key(client, auth)
    shipment_id = client.post("/shipments", headers=auth, json={"number": "RR123456789SA"}).json()["id"]
    renamed = client.patch(f"/shipments/{shipment_id}", headers=auth, json={"label": "Books"}).json()
    assert renamed["label"] == "Books"
    other = bearer(sign_up(client, "other@example.com"))
    assert client.patch(f"/shipments/{shipment_id}", headers=other, json={"label": "Mine"}).status_code == 404
    assert client.delete(f"/shipments/{shipment_id}", headers=other).status_code == 404
    assert client.get("/shipments", headers=other).json()["shipments"] == []

    client.patch(f"/shipments/{shipment_id}", headers=auth, json={"archived": True})
    assert client.get("/shipments", headers=auth).json()["shipments"] == []
    # Adding it again brings it back instead of a second copy.
    assert client.post("/shipments", headers=auth, json={"number": "RR123456789SA"}).status_code == 201
    assert client.delete(f"/shipments/{shipment_id}", headers=auth).status_code == 204
    assert track.asked("deletetrack") == ["RR123456789SA"]


def test_old_deliveries_leave_the_list(db: Session, me: dict, track: Fake17Track):
    db.add(ServiceConnection(user_id=me["user_id"], provider="17track", url=tracking_api.BASE_URL, api_key=encrypt_secret(KEY)))
    db.add(
        Shipment(
            user_id=me["user_id"],
            number="RR111111111SA",
            status="delivered",
            registered=True,
            delivered_at=NOW - timedelta(days=40),
            events=[],
        )
    )
    db.commit()
    tracker.refresh(db, me["user_id"])
    assert db.scalar(select(Shipment)).archived is True
    assert track.asked("gettrackinfo") == []


# --- Gmail ------------------------------------------------------------------------------------------------------


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


class FakeGmail:
    def __init__(self) -> None:
        self.searches: list[str] = []
        self.read: list[str] = []
        self.messages = {
            "m1": ("Noon <no-reply@noon.com>", "Your order is on its way", "html", "<p>Tracking number:</p><b>34120987651</b>", 2),
            "m2": ("no-reply <ship@mail.amazon.sa>", "تم شحن طلبك", "plain", "رقم التتبع: TBA123456789012", 1),
            "m3": ("A Friend <friend@mail.example>", "Lunch?", "plain", "Order #402-1234567-7654321", 1),
        }

    def __call__(self, request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer access-1"
        path = request.url.path.removeprefix("/gmail/v1/users/me")
        if path == "/messages":
            self.searches.append(request.url.params["q"])
            return httpx.Response(200, json={"messages": [{"id": key} for key in self.messages]})
        message_id = path.removeprefix("/messages/")
        assert request.url.params["format"] == "full"
        self.read.append(message_id)
        sender, subject, kind, body, days_ago = self.messages[message_id]
        sent = int((datetime.now(UTC) - timedelta(days=days_ago)).timestamp() * 1000)
        payload = {
            "mimeType": "multipart/alternative",
            "headers": [{"name": "From", "value": sender}, {"name": "Subject", "value": subject}],
            "parts": [{"mimeType": f"text/{kind}", "body": {"data": _b64(body)}}],
        }
        return httpx.Response(200, json={"id": message_id, "internalDate": str(sent), "snippet": "", "payload": payload})


@pytest.fixture
def gmail(monkeypatch: pytest.MonkeyPatch, db: Session, me: dict) -> FakeGmail:
    fake = FakeGmail()
    monkeypatch.setattr(gmail_api, "transport", httpx.MockTransport(fake))
    db.add(
        GmailConnection(
            user_id=me["user_id"],
            email="me@example.com",
            access_token=encrypt_secret("access-1"),
            refresh_token=encrypt_secret("refresh-1"),
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
    )
    db.commit()
    return fake


def test_shipping_emails_add_shipments_with_the_shop(client: TestClient, auth: dict, gmail: FakeGmail, track: Fake17Track):
    link_key(client, auth)
    overview = client.post("/shipments/refresh", headers=auth).json()
    found = {row["number"]: row for row in overview["shipments"]}
    assert set(found) == {"34120987651", "TBA123456789012"}
    assert found["34120987651"]["store"] == "Noon" and found["34120987651"]["source"] == "email"
    assert found["TBA123456789012"]["store"] == "Amazon"
    assert all(row["registered"] for row in found.values())
    assert overview["emails_read"] == 3 and overview["email_error"] is None
    assert gmail.searches[0].startswith("newer_than:21d")

    # The next look starts after the last one and skips emails it already used.
    client.post("/shipments/refresh", headers=auth)
    assert gmail.searches[1].startswith("after:")
    assert gmail.read.count("m1") == 1 and gmail.read.count("m3") == 2
    assert len(client.get("/shipments", headers=auth).json()["shipments"]) == 2


def test_only_the_number_is_kept_from_an_email(client: TestClient, auth: dict, gmail: FakeGmail, db: Session):
    client.post("/shipments/refresh", headers=auth)
    rows = list(db.scalars(select(Shipment)))
    assert len(rows) == 2 and all(r.status == "pending" for r in rows)
    kept = json.dumps([[r.number, r.label, r.store, r.email_id, r.last_event] for r in rows], ensure_ascii=False)
    assert "Tracking number" not in kept and "رقم التتبع" not in kept and "on its way" not in kept


def test_export_includes_shipments(client: TestClient, auth: dict):
    client.post("/shipments", headers=auth, json={"number": "RR123456789SA", "label": "Books"})
    exported = client.get("/export", headers=auth).json()
    assert [row["number"] for row in exported["shipments"]] == ["RR123456789SA"]
