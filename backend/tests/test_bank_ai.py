"""The AI reads bank messages no template fits. The AI itself is stubbed; messages are synthetic."""

import json
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AiConnection
from app.security import encrypt_secret
from app.services import bank_ai, whoop_ai
from app.services.whoop_ai import AiAccess

MESSAGE = "Payment 25.50 SAR at Cafe Demo with card ending 1234"
ACCESS = AiAccess("openai", "made-up", "made-up-key")
GOOD = {"kind": "purchase", "amount": "25.50", "currency": "SAR", "merchant": "Cafe Demo", "card_last4": "1234"}


def answer(monkeypatch, text: str) -> None:
    monkeypatch.setattr(bank_ai.assistant, "complete", lambda *args, **kwargs: text)


def me(client: TestClient, auth: dict) -> uuid.UUID:
    return uuid.UUID(client.get("/auth/me", headers=auth).json()["id"])


def test_good_answer_is_read_for_review(monkeypatch):
    answer(monkeypatch, "Here you go:\n" + json.dumps(GOOD))
    result = bank_ai.read_with_ai(ACCESS, MESSAGE, [])
    assert result is not None
    assert (result["kind"], result["amount_minor"], result["currency"], result["merchant"], result["card_last4"]) == (
        "purchase",
        2550,
        "SAR",
        "Cafe Demo",
        "1234",
    )
    assert result["status"] == "needs_review" and result["review_reasons"] == ["read_by_ai"]
    assert result["category"] == "food"


@pytest.mark.parametrize(
    "text",
    [
        "not json",
        json.dumps({**GOOD, "kind": "salary"}),
        json.dumps({**GOOD, "amount": "-5"}),
        json.dumps({**GOOD, "currency": "BTC"}),
        json.dumps({**GOOD, "card_last4": "1234567812345678"}),
        json.dumps({**GOOD, "merchant": "x" * 101}),
    ],
)
def test_bad_ai_answers_fall_back(monkeypatch, text):
    answer(monkeypatch, text)
    assert bank_ai.read_with_ai(ACCESS, MESSAGE, []) is None


def test_ai_error_falls_back(monkeypatch):
    def broken(*args, **kwargs):
        raise whoop_ai.InsightUnavailable("down")

    monkeypatch.setattr(bank_ai.assistant, "complete", broken)
    assert bank_ai.read_with_ai(ACCESS, MESSAGE, []) is None


def test_admin_server_key_is_not_used(client: TestClient, auth: dict, db: Session, monkeypatch):
    client.post("/bank-sms/token", headers=auth)
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "made-up-server-key")
    assert whoop_ai.access_for(db, me(client, auth), feature="bank_sms") is not None
    assert bank_ai.access(db, me(client, auth)) is None
    assert client.get("/bank-sms/settings", headers=auth).json() == {"ai_read": True, "ai_available": False}


def test_switch_off_means_no_ai(client: TestClient, auth: dict, db: Session):
    client.post("/bank-sms/token", headers=auth)
    db.add(AiConnection(user_id=me(client, auth), provider="openai", model="made-up", api_key=encrypt_secret("made-up-key")))
    db.commit()
    assert bank_ai.access(db, me(client, auth)) is not None
    assert client.patch("/bank-sms/settings", json={"ai_read": False}, headers=auth).json() == {"ai_read": False, "ai_available": True}
    db.expire_all()
    assert bank_ai.access(db, me(client, auth)) is None


def test_new_key_keeps_the_switch(client: TestClient, auth: dict):
    client.post("/bank-sms/token", headers=auth)
    client.patch("/bank-sms/settings", json={"ai_read": False}, headers=auth)
    client.post("/bank-sms/token", headers=auth)
    assert client.get("/bank-sms/settings", headers=auth).json()["ai_read"] is False


def test_settings_without_a_key_is_404(client: TestClient, auth: dict):
    assert client.get("/bank-sms/settings", headers=auth).status_code == 404
