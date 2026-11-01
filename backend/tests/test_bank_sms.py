"""POST /bank-sms end to end on a real Postgres. All messages are synthetic, not verified bank templates."""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services import bank_sms

from .conftest import bearer, sign_up

FIXTURES = json.loads((Path(__file__).parent / "fixtures/bank_sms.json").read_text(encoding="utf-8"))
AT = "2026-11-01T12:00:00+03:00"
PURCHASE = "شراء; مبلغ: 25.50 SAR; لدى: Cafe Demo; بطاقة: *1234; مرجع: E2E-A"


@pytest.fixture
def key(client: TestClient, auth: dict) -> dict[str, str]:
    response = client.post("/bank-sms/token", headers=auth)
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['token']}"}


def send(client: TestClient, key: dict, bank: str, message: str, event_id: str | None = None):
    body = {"bank": bank, "message": message, "event_id": event_id or str(uuid4()), "received_at": AT}
    return client.post("/bank-sms", json=body, headers=key)


def rows(client: TestClient, auth: dict) -> list[dict]:
    return client.get("/bank-sms/transactions", headers=auth).json()


def confirm(client: TestClient, auth: dict, row_id: str, **extra):
    return client.patch(f"/bank-sms/transactions/{row_id}/review", json={"status": "confirmed", **extra}, headers=auth)


def test_valid_message_is_read_and_waits_for_review(client, auth, key):
    response = send(client, key, "rajhi", PURCHASE)
    assert response.status_code == 201
    row = response.json()["transaction"]
    assert response.json()["duplicate"] is False
    assert (row["amount"], row["currency"], row["merchant"], row["card_last4"]) == (25.5, "SAR", "Cafe Demo", "1234")
    assert row["kind"] == "purchase" and row["category"] == "food" and row["status"] == "needs_review"
    assert "unverified_bank_format" in row["review_reasons"]
    assert client.get("/expenses", headers=auth).json() == []


def test_no_key_wrong_key_and_session_token_are_refused(client, auth, key):
    body = {"bank": "rajhi", "message": PURCHASE, "event_id": str(uuid4())}
    assert client.post("/bank-sms", json=body).status_code == 401
    assert client.post("/bank-sms", json=body, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.post("/bank-sms", json=body, headers=auth).status_code == 401
    # The Shortcut's key opens this one door only.
    assert client.get("/bank-sms/transactions", headers=key).status_code == 401
    assert client.get("/tasks", headers=key).status_code == 401
    assert client.get("/bank-sms/transactions").status_code == 401


def test_new_key_replaces_the_old_and_revoke_ends_it(client, auth, key):
    assert client.get("/bank-sms/status", headers=auth).json()["connected"] is True
    newer = {"Authorization": f"Bearer {client.post('/bank-sms/token', headers=auth).json()['token']}"}
    assert send(client, key, "rajhi", PURCHASE).status_code == 401
    assert send(client, newer, "rajhi", PURCHASE).status_code == 201
    assert client.get("/bank-sms/status", headers=auth).json()["last_used_at"] is not None
    assert client.delete("/bank-sms/token", headers=auth).status_code == 204
    assert send(client, newer, "rajhi", "شراء مبلغ: 1 ريال").status_code == 401
    assert client.get("/bank-sms/status", headers=auth).json()["connected"] is False


def test_key_is_stored_hashed(client, auth, db: Session):
    token = client.post("/bank-sms/token", headers=auth).json()["token"]
    assert db.execute(text("select token_hash from bank_sms_tokens")).scalar_one() != token


@pytest.mark.parametrize("fixture", FIXTURES, ids=lambda f: f["bank"])
def test_six_banks(client, key, fixture):
    row = send(client, key, fixture["bank"], fixture["message"]).json()["transaction"]
    assert (row["bank"], row["amount"], row["status"]) == (fixture["bank"], fixture["amount"], "needs_review")


@pytest.mark.parametrize(
    "message",
    ["OTP verification code 482913", "رمز التحقق 482913", "الرمز 482913 لعملية شراء 50 ريال", "شراء 50 ريال بطاقة 4111 1111 1111 1111"],
)
def test_sensitive_is_refused_saved_nowhere_and_not_echoed(client, auth, key, db: Session, message):
    response = send(client, key, "snb", message)
    assert response.status_code == 422
    assert "482913" not in response.text and "4111" not in response.text
    assert rows(client, auth) == []
    assert db.execute(text("select count(*) from bank_sms_events")).scalar_one() == 0


def test_retry_same_reference_and_reused_event_id(client, auth, key):
    event_id = str(uuid4())
    first = send(client, key, "rajhi", PURCHASE, event_id)
    retry = send(client, key, "rajhi", PURCHASE, event_id)
    same_reference = send(client, key, "rajhi", PURCHASE)
    assert (retry.status_code, retry.json()["duplicate"]) == (200, True)
    assert (same_reference.status_code, same_reference.json()["duplicate"]) == (200, True)
    assert retry.json()["transaction"]["id"] == first.json()["transaction"]["id"]
    assert send(client, key, "rajhi", "شراء مبلغ: 99 ريال", event_id).status_code == 409
    assert send(client, key, "rajhi", "شراء مبلغ: 99 ريال; مرجع: E2E-A").status_code == 409
    assert len(rows(client, auth)) == 1


def test_simultaneous_deliveries_make_one_transaction(client, auth, key):
    event_id = str(uuid4())
    with ThreadPoolExecutor(8) as pool:
        same_event = list(pool.map(lambda _: send(client, key, "rajhi", PURCHASE, event_id), range(8)))
        same_reference = list(pool.map(lambda _: send(client, key, "rajhi", PURCHASE), range(8)))
    assert sorted(r.status_code for r in same_event + same_reference) == [200] * 15 + [201]
    assert len(rows(client, auth)) == 1


def test_identical_message_without_reference_is_flagged_not_merged(client, auth, key):
    send(client, key, "barq", "شراء\nمبلغ: 33 ريال")
    twin = send(client, key, "barq", "شراء\nمبلغ: 33 ريال").json()["transaction"]
    assert "possible_duplicate" in twin["review_reasons"] and twin["status"] == "needs_review"
    assert len(rows(client, auth)) == 2


def test_confirmed_purchase_reaches_expenses_once_and_ignoring_removes_it(client, auth, key):
    row = send(client, key, "alinma", "POS Purchase\nAmount: SAR 120.00\nMerchant: TEST GROCERY").json()["transaction"]
    confirmed = confirm(client, auth, row["id"]).json()
    assert confirm(client, auth, row["id"], category="shopping").json()["expense_id"] == confirmed["expense_id"]
    expenses = client.get("/expenses", headers=auth).json()
    assert [(e["merchant"], e["amount"], e["currency"], e["category"]) for e in expenses] == [("TEST GROCERY", 120.0, "SAR", "shopping")]
    assert client.patch(f"/bank-sms/transactions/{row['id']}/review", json={"status": "ignored"}, headers=auth).json()["expense_id"] is None
    assert client.get("/expenses", headers=auth).json() == []
    assert confirm(client, auth, row["id"]).status_code == 409


def test_grocery_merchant_gets_the_new_category(client, key):
    row = send(client, key, "alinma", "POS Purchase\nAmount: SAR 10.00\nMerchant: TEST GROCERY").json()["transaction"]
    assert row["category"] == "groceries"


def test_report_counts_spending_only(client, auth, key):
    for message in (
        "POS Purchase\nAmount: SAR 120.00",
        "Refund\nAmount: SAR 20.00",
        "رسوم بنكية\nمبلغ: 5 ريال",
        "POS Purchase\nAmount: USD 10.00",
    ):
        assert confirm(client, auth, send(client, key, "alinma", message).json()["transaction"]["id"]).status_code == 200
    movements = [
        ("حوالة داخلية صادرة\nمبلغ: 500 ريال", "transfer_out"),
        ("حوالة واردة\nمبلغ: 700 ريال", "transfer_in"),
        ("سداد بطاقة ائتمانية\nمبلغ: 900 ريال", "card_payment"),
        ("سحب نقدي\nمبلغ: 200 ريال", "cash_withdrawal"),
    ]
    for message, kind in movements:
        row = send(client, key, "snb", message).json()["transaction"]
        assert row["kind"] == kind and "non_expense_movement" in row["review_reasons"]
        confirmed = confirm(client, auth, row["id"])
        assert confirmed.status_code == 200 and confirmed.json()["expense_id"] is None
    send(client, key, "rajhi", "شراء\nمبلغ: 77 ريال")
    report = client.get("/bank-sms/reports/monthly?month=2026-11", headers=auth).json()
    assert report["totals"] == {
        "SAR": {"expenses": 125.0, "refunds": 20.0, "net": 105.0},
        "USD": {"expenses": 10.0, "refunds": 0.0, "net": 10.0},
    }
    assert report["needs_review"] == 1
    # Refunds and money movements never become expense rows.
    assert sorted(e["amount"] for e in client.get("/expenses", headers=auth).json()) == [5.0, 10.0, 120.0]


def test_declined_and_unknown_never_count(client, auth, key):
    declined = send(client, key, "rajhi", "تم رفض عملية شراء\nمبلغ: 50 ريال").json()["transaction"]
    assert declined["status"] == "ignored" and confirm(client, auth, declined["id"]).status_code == 409
    unknown = send(client, key, "d360", "رسالة غير مفهومة 12 ريال").json()["transaction"]
    assert unknown["kind"] == "unknown" and unknown["status"] == "needs_review"
    assert confirm(client, auth, unknown["id"]).status_code == 409
    two = send(client, key, "rajhi", "شراء\nمبلغ: 100 USD\nبما يعادل: 375 SAR").json()["transaction"]
    assert two["amount"] is None and "ambiguous_amount" in two["review_reasons"]
    assert client.get("/expenses", headers=auth).json() == []


def test_verified_bank_posts_straight_to_expenses(client, auth, key, monkeypatch):
    monkeypatch.setitem(bank_sms.BANKS["rajhi"], "verified", True)
    row = send(client, key, "rajhi", PURCHASE).json()["transaction"]
    assert row["status"] == "confirmed" and row["expense_id"]
    assert len(client.get("/expenses", headers=auth).json()) == 1


def test_stores_and_returns_no_message_or_reference(client, auth, key, db: Session):
    response = send(client, key, "rajhi", PURCHASE)
    assert "E2E-A" not in response.text and "mac" not in response.text
    stored = db.execute(text("select row_to_json(t)::text from bank_transactions t")).scalar_one()
    assert "E2E-A" not in stored and "شراء" not in stored
    assert "message_mac" in stored
    export = client.get("/export", headers=auth)
    assert "E2E-A" not in export.text
    assert export.json()["bank_transactions"][0]["message_mac"] == "[redacted]"


def test_limits(client, key):
    assert client.post("/bank-sms", content=b"x" * 20000, headers={**key, "Content-Type": "application/json"}).status_code == 413
    assert client.post("/bank-sms", content=b"{}", headers={**key, "Content-Type": "text/plain"}).status_code == 415
    assert client.post("/bank-sms", content=b"not json", headers={**key, "Content-Type": "application/json"}).status_code == 422
    assert send(client, key, "nope", "شراء").status_code == 422
    assert send(client, key, "rajhi", "x" * 4001).status_code == 422
    future = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
    body = {"bank": "rajhi", "message": "شراء", "event_id": str(uuid4()), "received_at": future}
    assert client.post("/bank-sms", json=body, headers=key).status_code == 422
    assert client.post("/bank-sms", json={**body, "received_at": "2026-11-01T12:00:00"}, headers=key).status_code == 422
    assert client.post("/bank-sms", json={**body, "received_at": AT, "extra": 1}, headers=key).status_code == 422


def test_invalid_field_error_does_not_echo_the_message(client, key):
    response = send(client, key, "nope", "secret-looking-text")
    assert "secret-looking-text" not in response.text


def test_rate_limit(client, key, monkeypatch):
    from app.routers import bank_sms as router

    monkeypatch.setattr(router, "MAX_PER_MINUTE", 2)
    assert send(client, key, "rajhi", "شراء مبلغ: 1 ريال").status_code == 201
    assert send(client, key, "rajhi", "شراء مبلغ: 2 ريال").status_code == 201
    assert send(client, key, "rajhi", "شراء مبلغ: 3 ريال").status_code == 429


def test_another_user_sees_nothing_and_cant_review(client, auth, key):
    row = send(client, key, "rajhi", PURCHASE).json()["transaction"]
    other = bearer(sign_up(client, email="other@example.com"))
    assert rows(client, other) == []
    assert confirm(client, other, row["id"]).status_code == 404
    other_key = {"Authorization": f"Bearer {client.post('/bank-sms/token', headers=other).json()['token']}"}
    # The same SMS for another account is its own transaction.
    assert send(client, other_key, "rajhi", PURCHASE).json()["duplicate"] is False


def test_deleting_the_account_takes_everything(client, auth, key, db: Session):
    send(client, key, "rajhi", PURCHASE)
    response = client.post("/auth/delete-account", json={"password": "correct horse battery"}, headers=auth)
    assert response.status_code in (200, 204)
    for table in ("bank_transactions", "bank_sms_events", "bank_sms_tokens"):
        assert db.execute(text(f"select count(*) from {table}")).scalar_one() == 0
