"""The user's own AI reads a bank message that none of their templates fits. What it reads always waits for review.

Only an AI the user connected themselves is used, never the server's fallback key, because the message text goes to it.
The text and the answer are not kept. Templates are sent as examples; they hold placeholders, not values.
"""

import json
import re
import uuid

from sqlalchemy.orm import Session

from app.db import get_sessionmaker
from app.models import BankSmsToken
from app.models.bank_sms import KINDS
from app.services import assistant, whoop_ai
from app.services.bank_sms import category_for, currency_code, minor_units

TIMEOUT_SECONDS = 8.0

SYSTEM = """You read one bank SMS for a personal finance app and answer with JSON only, no other text:
{"kind": one of purchase, fee, refund, transfer_in, transfer_out, card_payment, cash_withdrawal, unknown,
 "amount": the transaction amount as written, digits only with an optional decimal point (not the balance),
 "currency": the 3-letter code, "merchant": the shop or payee or null, "card_last4": the card's last 4 digits or null}
A declined, failed or pending transaction is "unknown". If you are not sure, use "unknown".
The examples show this user's bank formats; {amount}, {merchant}, {card}, {num} and {any} stand for changing values."""


def access(db: Session, user_id: uuid.UUID) -> whoop_ai.AiAccess | whoop_ai.ChatgptAccess | None:
    token = db.get(BankSmsToken, user_id)
    if token is None or not token.ai_read or not whoop_ai.connected(db, user_id):
        return None
    return whoop_ai.access_for(db, user_id, feature="bank_sms")


def read_in_own_session(user_id: uuid.UUID, message: str, patterns: list[str]) -> dict | None:
    """The AI step with a session of its own: a call that outlives the request's timeout never touches the request's."""
    with get_sessionmaker()() as db:
        ai = access(db, user_id)
        return read_with_ai(ai, message, patterns) if ai is not None else None


def read_with_ai(ai: whoop_ai.AiAccess | whoop_ai.ChatgptAccess, message: str, patterns: list[str]) -> dict | None:
    """A parse_sms-shaped result, or None when the AI fails or answers something that doesn't hold up."""
    prompt = json.dumps({"examples": patterns[:20], "message": message}, ensure_ascii=False)
    try:
        text = assistant.complete(ai, SYSTEM, prompt, max_tokens=300)
    except Exception:  # noqa: BLE001 - any failure falls back to the generic reader; the SMS must not be lost.
        return None
    found = re.search(r"\{.*\}", text, re.DOTALL)
    try:
        answer = json.loads(found[0]) if found else None
    except json.JSONDecodeError:
        return None
    if not isinstance(answer, dict) or answer.get("kind") not in KINDS:
        return None
    merchant, card = answer.get("merchant"), answer.get("card_last4")
    if merchant is not None and (not isinstance(merchant, str) or len(merchant) > 100):
        return None
    if card is not None and not (isinstance(card, str) and re.fullmatch(r"\d{4}", card)):
        return None
    amount = minor_units(str(answer.get("amount") or "").strip())
    currency = currency_code(str(answer.get("currency") or ""))
    kind = answer["kind"]
    if kind != "unknown" and (amount is None or currency is None):
        return None
    merchant = (merchant or "").strip() or None
    return {
        "kind": kind,
        "amount_minor": amount if kind != "unknown" else None,
        "currency": currency if kind != "unknown" else None,
        "merchant": merchant,
        "card_last4": card,
        "reference": None,
        "status": "needs_review",
        "category": category_for(merchant),
        "review_reasons": ["read_by_ai"],
    }
