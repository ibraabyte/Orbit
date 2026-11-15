"""The subscription hunter and read-only Gmail, against a fake Google. All data here is made up."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from urllib.parse import parse_qs, urlparse

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Bill, GmailConnection, SubscriptionFind
from app.security import decrypt_secret
from app.services import gmail_api
from app.services import subscriptions as hunter
from app.services.subscriptions import Charge
from tests.conftest import bearer, sign_up

TODAY = date(2026, 11, 15)


def monthly(key: str, name: str, amount: str, months: int = 3, source: str = "expenses", last: date = date(2026, 11, 3)) -> list[Charge]:
    charges = []
    for back in range(months):
        on = last - timedelta(days=30 * back)
        charges.append(Charge(key, name, on, source, Decimal(amount), "SAR", known=key in hunter._BY_KEY))
    return charges


# --- detect() ---------------------------------------------------------------------------------------------------


def test_merchant_names_from_statements_become_one_key():
    assert hunter.merchant_key("NETFLIX.COM 866-579-7172")[0] == "netflix"
    assert hunter.merchant_key("نتفلكس")[0] == "netflix"
    assert hunter.merchant_key("APPLE.COM/BILL ITUNES.COM")[0] == "apple"
    assert hunter.merchant_key("Gym Plus Riyadh 0042") == ("gym plus", "Gym Plus")
    assert hunter.merchant_key("1234 5678") == ("", "")


def test_amounts_in_english_and_arabic():
    assert hunter.parse_amount("Your receipt: SAR 45.00 for Premium") == (Decimal("45.00"), "SAR")
    assert hunter.parse_amount("تم تجديد اشتراكك بمبلغ ٤٥٫٠٠ ريال") == (Decimal("45.00"), "SAR")
    assert hunter.parse_amount("Total $9.99 billed") == (Decimal("9.99"), "USD")
    assert hunter.parse_amount("Total: 1,299.50 USD") == (Decimal("1299.50"), "USD")
    assert hunter.parse_amount("No money here, order 123") is None


def test_a_known_service_charging_monthly_is_found_and_untracked():
    [found] = hunter.detect(monthly("netflix", "Netflix", "45.00"), TODAY)
    assert found.name == "Netflix" and found.period == "monthly" and found.charges == 3
    assert found.amount == Decimal("45.00") and found.currency == "SAR"
    assert found.next_expected_on == date(2026, 12, 3)
    assert found.cancel_url and "netflix.com" in found.cancel_url
    assert found.flags == ["untracked"]


def test_one_charge_from_a_known_service_is_enough():
    [found] = hunter.detect([Charge("spotify", "Spotify", date(2026, 11, 1), "bank", Decimal("21.99"), "SAR", known=True)], TODAY)
    assert found.key == "spotify" and found.charges == 1


def test_an_unknown_merchant_needs_a_regular_steady_charge():
    assert [f.key for f in hunter.detect(monthly("gym plus", "Gym Plus", "199.00"), TODAY)] == ["gym plus"]
    uneven = [Charge("cafe x", "Cafe X", date(2026, 11, d), "expenses", Decimal(a), "SAR") for d, a in ((1, "18"), (4, "33"), (9, "12"))]
    assert hunter.detect(uneven, TODAY) == []
    once = [Charge("gym plus", "Gym Plus", date(2026, 11, 1), "expenses", Decimal("199"), "SAR")]
    assert hunter.detect(once, TODAY) == []


def test_something_that_stopped_charging_is_not_listed():
    assert hunter.detect(monthly("netflix", "Netflix", "45.00", last=date(2026, 8, 1)), TODAY) == []


def test_price_up_and_two_video_services():
    charges = monthly("netflix", "Netflix", "45.00", last=date(2026, 10, 3)) + [
        Charge("netflix", "Netflix", date(2026, 11, 3), "expenses", Decimal("55.00"), "SAR", known=True)
    ]
    charges += monthly("shahid", "Shahid", "29.00")
    finds = {f.key: f for f in hunter.detect(charges, TODAY, tracked_keys={"shahid"})}
    assert finds["netflix"].previous_amount == Decimal("45.00") and finds["netflix"].amount == Decimal("55.00")
    assert set(finds["netflix"].flags) == {"price_up", "untracked", "duplicate"}
    assert set(finds["shahid"].flags) == {"duplicate"}


def mail(subject: str, sender: str, days_ago: int, snippet: str = "") -> gmail_api.MailHeader:
    name, _, email = sender.partition("<")
    return gmail_api.MailHeader(
        "m" + str(days_ago),
        name.strip(),
        email.rstrip(">"),
        subject,
        datetime(2026, 11, 15, 9, tzinfo=UTC) - timedelta(days=days_ago),
        snippet,
    )


def test_emails_receipts_trials_and_cancellations():
    receipt = hunter.email_charge(mail("Your Spotify Premium receipt", "Spotify <no-reply@spotify.com>", 5, "Total SAR 21.99"))
    assert receipt and receipt.key == "spotify" and receipt.amount == Decimal("21.99") and receipt.is_charge
    trial = hunter.email_charge(mail("Your free trial ends in 3 days", "Canva <hello@canva.com>", 2, "you'll be charged $14.99"))
    assert trial and trial.trial_ends and not trial.is_charge
    [found] = hunter.detect([trial], TODAY)
    assert found.key == "canva" and "trial_ending" in found.flags and found.next_expected_on is None
    # A shop's order receipt from someone unknown says nothing about a subscription.
    assert hunter.email_charge(mail("Your order receipt", "Some Shop <orders@shop.example>", 3, "SAR 80")) is None
    # An unknown sender that says renewal, with a price, counts.
    renewal = hunter.email_charge(mail("Your subscription renewed", "Cloud Notes <billing@cloudnotes.example>", 4, "SAR 15.00"))
    assert renewal and [f.key for f in hunter.detect([renewal], TODAY)] == ["cloud notes"]
    # Cancelled after the last charge: gone.
    cancel = hunter.email_charge(mail("Your subscription has been cancelled", "Spotify <no-reply@spotify.com>", 1))
    assert cancel and cancel.cancelled
    assert hunter.detect([receipt, cancel], TODAY) == []


def test_the_sms_and_the_receipt_for_one_payment_count_once():
    sms = Charge("spotify", "Spotify", date(2026, 11, 10), "bank", Decimal("21.99"), "SAR", known=True)
    email = hunter.email_charge(mail("Your Spotify receipt", "Spotify <no-reply@spotify.com>", 4, "SAR 21.99"))
    assert email is not None
    [found] = hunter.detect([sms, email], TODAY)
    assert found.charges == 1 and found.sources == ["bank", "email"]


def test_next_charge_keeps_month_ends():
    assert hunter.next_charge(date(2026, 1, 31), "monthly") == date(2026, 2, 28)
    assert hunter.next_charge(date(2026, 11, 5), "monthly") == date(2026, 12, 5)
    assert hunter.next_charge(date(2026, 11, 5), "yearly") == date(2027, 11, 5)
    assert hunter.next_charge(date(2026, 11, 5), "weekly") == date(2026, 11, 12)


# --- The API ----------------------------------------------------------------------------------------------------


def spend(client: TestClient, auth: dict, merchant: str, amount: float, days_ago: int, category: str = "subscriptions") -> None:
    spent_at = (datetime.now(UTC) - timedelta(days=days_ago)).isoformat()
    body = {"merchant": merchant, "amount": amount, "currency": "SAR", "category": category, "spent_at": spent_at}
    response = client.post("/expenses", headers=auth, json=body)
    assert response.status_code == 201, response.text


def test_scan_finds_untracked_subscriptions_and_keeps_decisions(client: TestClient, auth: dict, db: Session):
    for days in (5, 35, 65):
        spend(client, auth, "NETFLIX.COM", 45, days)
        spend(client, auth, "Gym Plus", 199, days + 1, "fitness")
    for days in (3, 10, 17):
        spend(client, auth, "Corner Grocery", 60 + days, days, "groceries")
    assert client.get("/subscriptions", headers=auth).json()["finds"] == []

    overview = client.post("/subscriptions/scan", headers=auth).json()
    by_key = {f["key"]: f for f in overview["finds"]}
    assert set(by_key) == {"netflix", "gym plus"}
    assert by_key["netflix"]["flags"] == ["untracked"] and by_key["netflix"]["status"] == "new"
    assert by_key["gym plus"]["cancel_is_search"] and "google.com/search" in by_key["gym plus"]["cancel_url"]
    assert overview["untracked_monthly"] == {"SAR": 244.0} and overview["scanned_at"]
    assert overview["gmail"]["connected"] is False

    gym = client.patch(f"/subscriptions/{by_key['gym plus']['id']}", headers=auth, json={"status": "kept"}).json()
    assert gym["status"] == "kept"
    tracked = client.post(f"/subscriptions/{by_key['netflix']['id']}/track", headers=auth).json()
    assert tracked["status"] == "tracked" and "untracked" not in tracked["flags"]
    bill = db.get(Bill, tracked["bill_id"])
    assert bill and bill.name == "Netflix" and bill.amount == Decimal("45.00") and bill.recurrence == "monthly"
    assert client.post(f"/subscriptions/{by_key['netflix']['id']}/track", headers=auth).status_code == 409

    again = {f["key"]: f for f in client.post("/subscriptions/scan", headers=auth).json()["finds"]}
    assert again["gym plus"]["status"] == "kept" and again["netflix"]["status"] == "tracked"
    assert "untracked" not in again["netflix"]["flags"]

    cancelled = client.patch(f"/subscriptions/{by_key['netflix']['id']}", headers=auth, json={"status": "cancelled"}).json()
    assert cancelled["status"] == "cancelled"
    db.expire_all()
    assert db.get(Bill, tracked["bill_id"]).status == "paused"


def test_finds_are_private(client: TestClient, auth: dict):
    spend(client, auth, "Spotify", 21.99, 3)
    [find] = client.post("/subscriptions/scan", headers=auth).json()["finds"]
    other = bearer(sign_up(client, "other@example.com"))
    assert client.get("/subscriptions", headers=other).json()["finds"] == []
    assert client.patch(f"/subscriptions/{find['id']}", headers=other, json={"status": "dismissed"}).status_code == 404
    assert client.post(f"/subscriptions/{find['id']}/track", headers=other).status_code == 404
    assert client.get("/subscriptions").status_code == 401


def test_an_untouched_find_that_stopped_is_dropped(client: TestClient, auth: dict, db: Session, me: dict):
    spend(client, auth, "Spotify", 21.99, 3)
    client.post("/subscriptions/scan", headers=auth)
    row = db.scalar(select(SubscriptionFind).where(SubscriptionFind.key == "spotify"))
    assert row is not None
    client.delete(f"/expenses/{_only_expense(client, auth)}", headers=auth)
    assert client.post("/subscriptions/scan", headers=auth).json()["finds"] == []


def _only_expense(client: TestClient, auth: dict) -> str:
    [expense] = client.get("/expenses", headers=auth).json()
    return expense["id"]


def test_tracking_without_a_price_asks_for_one(client: TestClient, auth: dict, db: Session, me: dict):
    db.add(
        SubscriptionFind(
            user_id=me["user_id"],
            key="canva",
            name="Canva",
            period="monthly",
            first_seen_on=TODAY,
            last_charged_on=TODAY,
            flags=["trial_ending"],
        )
    )
    db.commit()
    [find] = client.get("/subscriptions", headers=auth).json()["finds"]
    assert client.post(f"/subscriptions/{find['id']}/track", headers=auth).status_code == 422
    done = client.post(f"/subscriptions/{find['id']}/track", headers=auth, json={"amount": 14.99, "currency": "usd"}).json()
    assert done["status"] == "tracked"
    assert db.get(Bill, done["bill_id"]).currency == "USD"


# --- Gmail ------------------------------------------------------------------------------------------------------


class FakeGoogle:
    """Google's token endpoint and a tiny Gmail. Tests change what it answers."""

    def __init__(self) -> None:
        self.scope = f"openid https://www.googleapis.com/auth/userinfo.email {gmail_api.SCOPE}"
        self.mail_status = 200
        self.refresh_token: str | None = "refresh-1"
        self.revoked: list[str] = []
        self.searches: list[str] = []
        self.messages = {
            "a1": ("Spotify <no-reply@spotify.com>", "Your Spotify Premium receipt", "Total SAR 21.99", 6),
            "a2": ("Canva <hello@canva.com>", "Your free trial ends tomorrow", "You'll be charged $14.99", 1),
            "a3": ("A Friend <friend@mail.example>", "Lunch?", "See you", 2),
        }

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com" and request.url.path == "/token":
            body = {"access_token": "access-1", "expires_in": 3600, "scope": self.scope}
            if self.refresh_token:
                body["refresh_token"] = self.refresh_token
            return httpx.Response(200, json=body)
        if request.url.path == "/revoke":
            self.revoked.append(parse_qs(request.content.decode())["token"][0])
            return httpx.Response(200)
        assert request.headers["Authorization"] == "Bearer access-1"
        if self.mail_status != 200:
            return httpx.Response(self.mail_status, json={"error": {"code": self.mail_status}})
        path = request.url.path.removeprefix("/gmail/v1/users/me")
        if path == "/profile":
            return httpx.Response(200, json={"emailAddress": "me@example.com"})
        if path == "/messages":
            self.searches.append(request.url.params["q"])
            return httpx.Response(200, json={"messages": [{"id": key} for key in self.messages]})
        message_id = path.removeprefix("/messages/")
        sender, subject, snippet, days_ago = self.messages[message_id]
        sent = int((datetime.now(UTC) - timedelta(days=days_ago)).timestamp() * 1000)
        headers = [{"name": "From", "value": sender}, {"name": "Subject", "value": subject}]
        return httpx.Response(200, json={"id": message_id, "internalDate": str(sent), "snippet": snippet, "payload": {"headers": headers}})


@pytest.fixture
def google(monkeypatch: pytest.MonkeyPatch) -> FakeGoogle:
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "client-id")
    monkeypatch.setattr(settings, "google_client_secret", "client-secret")
    monkeypatch.setattr(settings, "google_redirect_uri", "https://api.test/auth/google/callback")
    fake = FakeGoogle()
    monkeypatch.setattr(gmail_api, "transport", httpx.MockTransport(fake))
    return fake


def connect_gmail(client: TestClient, auth: dict, **extra: str) -> dict[str, str]:
    started = client.post("/gmail/connect", headers=auth, json={"return_to": "orbit://gmail"})
    assert started.status_code == 200, started.text
    query = parse_qs(urlparse(started.json()["url"]).query)
    back = client.get("/gmail/callback", params={"code": "abc", "state": query["state"][0], **extra}, follow_redirects=False)
    assert back.status_code == 302 and back.headers["location"].startswith("orbit://gmail?")
    return {key: value[0] for key, value in parse_qs(urlparse(back.headers["location"]).query).items()}


def test_gmail_is_off_until_google_is_set_up(client: TestClient, auth: dict):
    assert client.get("/gmail/status", headers=auth).json() == {
        "configured": False, "connected": False, "email": None, "connected_at": None, "last_error": None
    }  # fmt: skip
    assert client.post("/gmail/connect", headers=auth).status_code == 503


def test_connect_asks_only_to_read_and_keeps_tokens_encrypted(client: TestClient, auth: dict, google: FakeGoogle, db: Session, me: dict):
    url = client.post("/gmail/connect", headers=auth).json()["url"]
    query = parse_qs(urlparse(url).query)
    assert query["redirect_uri"] == ["https://api.test/gmail/callback"]
    assert gmail_api.SCOPE in query["scope"][0].split() and "gmail.send" not in query["scope"][0]
    assert query["access_type"] == ["offline"] and query["login_hint"] == ["me@example.com"]

    assert connect_gmail(client, auth) == {"status": "connected"}
    row = db.get(GmailConnection, me["user_id"])
    assert row and row.email == "me@example.com"
    assert row.refresh_token != "refresh-1" and decrypt_secret(row.refresh_token) == "refresh-1"
    status = client.get("/gmail/status", headers=auth).json()
    assert status["connected"] and status["email"] == "me@example.com"


def test_callback_refusals(client: TestClient, auth: dict, google: FakeGoogle):
    expired = client.get("/gmail/callback", params={"code": "abc", "state": "not-a-state"}, follow_redirects=False)
    assert expired.headers["location"] == "orbit://gmail?status=expired"
    assert connect_gmail(client, auth, scope="openid email") == {"status": "no_mail_scope"}
    google.refresh_token = None
    assert connect_gmail(client, auth) == {"status": "error"}
    google.refresh_token = "refresh-1"
    google.mail_status = 403
    assert connect_gmail(client, auth) == {"status": "api_off"}
    assert client.get("/gmail/status", headers=auth).json()["connected"] is False


def test_scan_reads_subscription_emails(client: TestClient, auth: dict, google: FakeGoogle, db: Session):
    connect_gmail(client, auth)
    overview = client.post("/subscriptions/scan", headers=auth).json()
    by_key = {f["key"]: f for f in overview["finds"]}
    assert set(by_key) == {"spotify", "canva"}
    assert by_key["spotify"]["amount"] == 21.99 and by_key["spotify"]["sources"] == ["email"]
    assert by_key["canva"]["flags"] == ["trial_ending", "untracked"] and by_key["canva"]["amount"] == 14.99
    assert overview["emails_read"] == 3 and overview["email_error"] is None
    assert "newer_than:" in google.searches[0]
    # Only what's needed is kept: the subject line, never the email itself.
    assert by_key["spotify"]["evidence"] == "Your Spotify Premium receipt"


def test_a_revoked_gmail_is_reported_and_the_rest_still_scans(client: TestClient, auth: dict, google: FakeGoogle, db: Session, me: dict):
    connect_gmail(client, auth)
    spend(client, auth, "Spotify", 21.99, 3)
    row = db.get(GmailConnection, me["user_id"])
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()
    google.mail_status = 401
    overview = client.post("/subscriptions/scan", headers=auth).json()
    assert [f["key"] for f in overview["finds"]] == ["spotify"]
    assert "Connect Gmail again" in overview["email_error"]
    assert "Connect Gmail again" in client.get("/gmail/status", headers=auth).json()["last_error"]


def test_disconnect_revokes_and_forgets(client: TestClient, auth: dict, google: FakeGoogle, db: Session, me: dict):
    connect_gmail(client, auth)
    assert client.delete("/gmail/connection", headers=auth).status_code == 204
    assert google.revoked == ["refresh-1"]
    db.expire_all()
    assert db.get(GmailConnection, me["user_id"]) is None
