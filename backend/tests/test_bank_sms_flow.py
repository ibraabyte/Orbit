"""The order a message is read in: templates, then the user's AI, then the generic reader. Messages are synthetic."""

import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import AiConnection
from app.routers import bank_sms as router
from app.security import encrypt_secret
from app.services import bank_ai, bank_templates

EX = "شراء عبر مدى\nبطاقة: *1234\nمبلغ: 25.50 SAR\nلدى: Cafe Demo\nالرصيد: 1,020.00 SAR"
FIELDS = {"amount": "25.50", "currency": "SAR", "merchant": "Cafe Demo", "card_last4": "1234", "reference": None, "wildcards": []}
NEW = "شراء عبر مدى\nبطاقة: *9876\nمبلغ: 199.00 SAR\nلدى: Jarir Bookstore\nالرصيد: 80.10 SAR"
REFUND = "استرداد عبر مدى\nبطاقة: *1234\nمبلغ: 25.50 SAR\nلدى: Cafe Demo\nالرصيد: 1,045.50 SAR"
ENGLISH = "Purchase; Amount: 199.00 SAR; Merchant: Jarir; Card: *9876"
OTHER = "Payment 12 SAR at Kiosk with card ending 4321"


@pytest.fixture
def key(client: TestClient, auth: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {client.post('/bank-sms/token', headers=auth).json()['token']}"}


def template(client: TestClient, auth: dict, example: str = EX, kind: str = "purchase") -> None:
    body = {"example": example, "label": "مدى", "kind": kind, "fields": FIELDS}
    assert client.post("/bank-sms/templates", json=body, headers=auth).status_code == 201


def send(client: TestClient, key: dict, message: str) -> dict:
    response = client.post("/bank-sms", json={"message": message}, headers=key)
    assert response.status_code in (200, 201), response.text
    return response.json()["transaction"]


def connect_ai(client: TestClient, auth: dict, db: Session) -> None:
    user_id = uuid.UUID(client.get("/auth/me", headers=auth).json()["id"])
    db.add(AiConnection(user_id=user_id, provider="openai", model="made-up", api_key=encrypt_secret("made-up-key")))
    db.commit()


def test_template_match_counts_by_itself(client: TestClient, auth: dict, key: dict):
    template(client, auth)
    row = send(client, key, NEW)
    assert row["status"] == "confirmed" and row["amount"] == 199.0 and row["merchant"] == "Jarir Bookstore"
    assert [e["amount"] for e in client.get("/expenses", headers=auth).json()] == [199.0]


def test_template_refund_waits_for_review(client: TestClient, auth: dict, key: dict):
    template(client, auth, REFUND, "refund")
    row = send(client, key, REFUND.replace("25.50", "10.00"))
    assert row["kind"] == "refund" and row["status"] == "needs_review"


def test_same_amount_and_card_in_ten_minutes_goes_to_review(client: TestClient, auth: dict, key: dict):
    template(client, auth)
    assert send(client, key, NEW)["status"] == "confirmed"
    twin = send(client, key, ENGLISH)
    assert twin["status"] == "needs_review" and "possible_duplicate" in twin["review_reasons"]


def test_generic_read_first_then_template_twin_goes_to_review(client: TestClient, auth: dict, key: dict):
    template(client, auth)
    send(client, key, ENGLISH)
    twin = send(client, key, NEW)
    assert twin["status"] == "needs_review" and "possible_duplicate" in twin["review_reasons"]
    assert client.get("/expenses", headers=auth).json() == []


def test_no_template_uses_ai_then_review(client: TestClient, auth: dict, key: dict, db: Session, monkeypatch):
    connect_ai(client, auth, db)
    answer = {"kind": "purchase", "amount": "12", "currency": "SAR", "merchant": "Kiosk", "card_last4": "4321"}
    monkeypatch.setattr(bank_ai.assistant, "complete", lambda *args, **kwargs: json.dumps(answer))
    row = send(client, key, OTHER)
    assert row["status"] == "needs_review" and row["review_reasons"] == ["read_by_ai"] and row["amount"] == 12.0


def test_ai_timeout_falls_back(client: TestClient, auth: dict, key: dict, db: Session, monkeypatch):
    connect_ai(client, auth, db)
    monkeypatch.setattr(bank_ai, "TIMEOUT_SECONDS", 0.1)

    def slow(*args, **kwargs):
        time.sleep(1)
        return "{}"

    monkeypatch.setattr(bank_ai.assistant, "complete", slow)
    row = send(client, key, ENGLISH)
    assert "read_by_ai" not in row["review_reasons"] and "unverified_bank_format" in row["review_reasons"]


def test_sensitive_never_reaches_templates_or_ai(client: TestClient, auth: dict, key: dict, db: Session, monkeypatch):
    connect_ai(client, auth, db)

    def never(*args, **kwargs):
        raise AssertionError("must not be called")

    monkeypatch.setattr(router.bank_templates, "read_with_templates", never)
    monkeypatch.setattr(bank_ai, "read_with_ai", never)
    response = client.post("/bank-sms", json={"message": "OTP 123456 for your purchase"}, headers=key)
    assert response.status_code == 422


def test_template_conflict_goes_to_review(client: TestClient, auth: dict, key: dict):
    template(client, auth)
    template(client, auth, EX, "fee")
    row = send(client, key, NEW)
    assert row["status"] == "needs_review" and "template_conflict" in row["review_reasons"]


def test_template_is_not_reused_across_users(client: TestClient, auth: dict, key: dict):
    from .conftest import bearer, sign_up

    template(client, auth)
    other = bearer(sign_up(client, "flow-other@example.com"))
    other_key = {"Authorization": f"Bearer {client.post('/bank-sms/token', headers=other).json()['token']}"}
    assert send(client, other_key, NEW)["status"] == "needs_review"
    assert bank_templates  # imported for monkeypatch targets


def test_copy_without_the_card_is_still_a_duplicate(client: TestClient, auth: dict, key: dict):
    template(client, auth)
    assert send(client, key, NEW)["status"] == "confirmed"
    twin = send(client, key, "Purchase; Amount: 199.00 SAR; Merchant: Jarir")
    assert "possible_duplicate" in twin["review_reasons"]
    assert [e["amount"] for e in client.get("/expenses", headers=auth).json()] == [199.0]


def test_unexpected_ai_error_falls_back(client: TestClient, auth: dict, key: dict, db: Session, monkeypatch):
    connect_ai(client, auth, db)

    def broken(*args, **kwargs):
        raise RuntimeError("provider exploded")

    monkeypatch.setattr(bank_ai.assistant, "complete", broken)
    row = send(client, key, ENGLISH)
    assert "unverified_bank_format" in row["review_reasons"]


def test_ai_runs_on_its_own_database_session(client: TestClient, auth: dict, key: dict, db: Session, monkeypatch):
    # A timed-out AI call keeps running in its thread, so it must never share the request's session.
    connect_ai(client, auth, db)
    opened = []
    real = bank_ai.get_sessionmaker

    def spy():
        opened.append(True)
        return real()

    monkeypatch.setattr(bank_ai, "get_sessionmaker", spy)
    monkeypatch.setattr(bank_ai, "read_with_ai", lambda ai, message, patterns: None)
    send(client, key, ENGLISH)
    assert opened == [True]
