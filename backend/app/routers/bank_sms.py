"""Bank SMS from the user's iPhone Shortcut.

POST /bank-sms takes its own long-lived key, because a Shortcut can't refresh a 15-minute session. The key is checked
before the body is read, and the body is read here rather than by FastAPI so errors can't echo the message back.
Everything else uses the normal signed-in session.
"""

import hashlib
import hmac
import secrets
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.crud import get_owned
from app.deps import Db, UserId
from app.models import BankSmsEvent, BankSmsToken, BankTransaction, Expense
from app.schemas.domains import FinanceCategory
from app.security import hash_refresh_token
from app.services.bank_sms import BANKS, SensitiveMessage, normalize_message, parse_sms

router = APIRouter(prefix="/bank-sms", tags=["bank-sms"])

MAX_BODY_BYTES = 16 * 1024
MAX_PER_MINUTE = 120
SPENDING_KINDS = ("purchase", "fee")

_bearer = HTTPBearer(auto_error=False)
# ponytail: per-process counter, enough for one API worker; move to Postgres if ORBIT_WORKERS goes above 1.
_recent: dict[uuid.UUID, deque[float]] = defaultdict(deque)
_recent_lock = threading.Lock()


class Incoming(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bank: Literal["rajhi", "alinma", "stc", "d360", "barq", "snb"]
    message: str = Field(min_length=1, max_length=4000, strict=True)
    event_id: uuid.UUID
    received_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @field_validator("message")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Empty message")
        return value

    @field_validator("received_at")
    @classmethod
    def aware_and_not_future(cls, value: datetime) -> datetime:
        if value.utcoffset() is None:
            raise ValueError("Timezone required")
        if value > datetime.now(UTC) + timedelta(minutes=5):
            raise ValueError("Future timestamp")
        return value.astimezone(UTC)


class TransactionRow(BaseModel):
    """Everything except the keyed hashes."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    bank: str
    kind: str
    amount: float | None
    currency: str | None
    merchant: str | None
    card_last4: str | None
    category: str
    status: str
    review_reasons: list[str]
    received_at: datetime
    expense_id: uuid.UUID | None


class Review(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["confirmed", "ignored"]
    category: FinanceCategory | None = None


class TokenStatus(BaseModel):
    connected: bool
    created_at: datetime | None = None
    last_used_at: datetime | None = None


class NewToken(BaseModel):
    token: str


def ingest_user_id(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)], db: Db) -> uuid.UUID:
    token_hash = hash_refresh_token(credentials.credentials) if credentials else None
    row = db.scalar(select(BankSmsToken).where(BankSmsToken.token_hash == token_hash)) if token_hash else None
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unauthorized", headers={"WWW-Authenticate": "Bearer"})
    return row.user_id


def _check_rate(user_id: uuid.UUID) -> None:
    now = time.monotonic()
    with _recent_lock:
        recent = _recent[user_id]
        while recent and recent[0] < now - 60:
            recent.popleft()
        if len(recent) >= MAX_PER_MINUTE:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests", headers={"Retry-After": "60"})
        recent.append(now)


async def _read_body(request: Request) -> bytes:
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Use application/json")
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_BODY_BYTES:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Request too large")
    return bytes(body)


def _mac(user_id: uuid.UUID, value: str) -> str:
    # Derived from the signing secret, like stored third-party keys. Rotating that secret stops old repeats being spotted.
    key = hashlib.sha256(b"orbit:bank-sms:" + get_settings().jwt_secret.encode() + user_id.bytes).digest()
    return hmac.new(key, value.encode(), hashlib.sha256).hexdigest()


def _post_expense(db: Session, row: BankTransaction) -> None:
    if row.kind not in SPENDING_KINDS or row.expense_id is not None:
        return
    bank_name = BANKS[row.bank]["name_ar"]
    expense = Expense(
        user_id=row.user_id,
        merchant=row.merchant or bank_name,
        amount=row.amount,
        currency=row.currency,
        category=row.category,
        note=f"SMS · {bank_name}",
        spent_at=row.received_at,
    )
    db.add(expense)
    db.flush()
    row.expense_id = expense.id


def _save(
    db: Session, user_id: uuid.UUID, data: Incoming, parsed: dict, message_mac: str, reference_mac: str | None
) -> tuple[BankTransaction, bool]:
    # One writer per user, so two deliveries of the same SMS can't both look new.
    db.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(str(user_id), 0))))
    db.get(BankSmsToken, user_id).last_used_at = datetime.now(UTC)

    event = db.get(BankSmsEvent, (user_id, data.event_id))
    if event is not None:
        if event.message_mac != message_mac:
            raise HTTPException(status.HTTP_409_CONFLICT, "event_id is already used for a different message")
        return db.get(BankTransaction, event.transaction_id), True

    amount = None if parsed["amount_minor"] is None else Decimal(parsed["amount_minor"]) / 100
    row = None
    if reference_mac:
        row = db.scalar(select(BankTransaction).where(BankTransaction.user_id == user_id, BankTransaction.reference_mac == reference_mac))
    duplicate = row is not None
    if row is not None:
        # A bank reference alone is not enough when the message contradicts it.
        if row.amount != amount or row.currency != parsed["currency"]:
            raise HTTPException(status.HTTP_409_CONFLICT, "Reference conflicts with a stored transaction")
    else:
        reasons, tx_status = list(parsed["review_reasons"]), parsed["status"]
        twin = select(BankTransaction.id).where(
            BankTransaction.user_id == user_id,
            BankTransaction.message_mac == message_mac,
            BankTransaction.created_at > datetime.now(UTC) - timedelta(minutes=10),
        )
        if db.scalar(twin.limit(1)) is not None:
            reasons.append("possible_duplicate")
            tx_status = "needs_review"
        row = BankTransaction(
            user_id=user_id,
            bank=data.bank,
            kind=parsed["kind"],
            amount=amount,
            currency=parsed["currency"],
            merchant=parsed["merchant"],
            card_last4=parsed["card_last4"],
            category=parsed["category"],
            status=tx_status,
            review_reasons=reasons,
            received_at=data.received_at,
            report_month=data.received_at.astimezone(ZoneInfo("Asia/Riyadh")).strftime("%Y-%m"),
            message_mac=message_mac,
            reference_mac=reference_mac,
        )
        db.add(row)
        db.flush()
        if tx_status == "confirmed":
            _post_expense(db, row)
    db.add(BankSmsEvent(user_id=user_id, event_id=data.event_id, message_mac=message_mac, transaction_id=row.id))
    db.commit()
    db.refresh(row)
    return row, duplicate


@router.post("", response_model=None)
async def ingest(request: Request, user_id: Annotated[uuid.UUID, Depends(ingest_user_id)], db: Db) -> JSONResponse:
    _check_rate(user_id)
    body = await _read_body(request)
    try:
        data = Incoming.model_validate_json(body)
    except ValidationError:
        return JSONResponse({"detail": "Invalid request fields or JSON"}, status.HTTP_422_UNPROCESSABLE_CONTENT)
    try:
        parsed = parse_sms(data.bank, data.message)
    except SensitiveMessage:
        return JSONResponse({"detail": "Sensitive message rejected"}, status.HTTP_422_UNPROCESSABLE_CONTENT)
    message_mac = _mac(user_id, data.bank + "\0" + normalize_message(data.message))
    reference = parsed.get("reference")
    reference_mac = _mac(user_id, data.bank + "\0" + parsed["kind"] + "\0" + reference) if reference else None
    row, duplicate = await run_in_threadpool(_save, db, user_id, data, parsed, message_mac, reference_mac)
    payload = {"duplicate": duplicate, "transaction": TransactionRow.model_validate(row).model_dump(mode="json")}
    return JSONResponse(payload, status.HTTP_200_OK if duplicate else status.HTTP_201_CREATED)


@router.get("/status", response_model=TokenStatus)
def token_status(user_id: UserId, db: Db):
    row = db.get(BankSmsToken, user_id)
    if row is None:
        return TokenStatus(connected=False)
    return TokenStatus(connected=True, created_at=row.created_at, last_used_at=row.last_used_at)


@router.post("/token", response_model=NewToken, status_code=status.HTTP_201_CREATED)
def new_token(user_id: UserId, db: Db):
    """Creates the Shortcut's key, replacing any earlier one. This is the only time it can be read."""
    token = "orbit_sms_" + secrets.token_urlsafe(32)
    db.merge(BankSmsToken(user_id=user_id, token_hash=hash_refresh_token(token), created_at=datetime.now(UTC), last_used_at=None))
    db.commit()
    return NewToken(token=token)


@router.delete("/token", status_code=status.HTTP_204_NO_CONTENT)
def revoke_token(user_id: UserId, db: Db):
    row = db.get(BankSmsToken, user_id)
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/transactions", response_model=list[TransactionRow])
def transactions(
    user_id: UserId,
    db: Db,
    tx_status: Annotated[Literal["needs_review", "confirmed", "ignored"] | None, Query(alias="status")] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    query = select(BankTransaction).where(BankTransaction.user_id == user_id)
    if tx_status:
        query = query.where(BankTransaction.status == tx_status)
    return db.scalars(query.order_by(BankTransaction.received_at.desc(), BankTransaction.id).limit(limit).offset(offset)).all()


@router.patch("/transactions/{row_id}/review", response_model=TransactionRow)
def review(row_id: uuid.UUID, body: Review, user_id: UserId, db: Db):
    row = get_owned(db, BankTransaction, row_id, user_id)
    if body.status == "confirmed":
        if row.amount is None or row.currency is None or row.kind == "unknown" or row.status == "ignored":
            raise HTTPException(status.HTTP_409_CONFLICT, "This transaction can't be confirmed; check the original SMS.")
        if row.status != "confirmed":
            row.category = body.category or row.category
            row.status = "confirmed"
            _post_expense(db, row)
        elif body.category:
            row.category = body.category
            if row.expense_id:
                db.get(Expense, row.expense_id).category = body.category
    else:
        if row.expense_id:
            db.delete(db.get(Expense, row.expense_id))
            row.expense_id = None
        row.status = "ignored"
        row.category = body.category or row.category
    db.commit()
    db.refresh(row)
    return row


@router.get("/reports/monthly")
def monthly_report(user_id: UserId, db: Db, month: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")):
    """Confirmed purchases and fees minus confirmed refunds, per currency. Transfers, card payments and cash are never spending."""
    rows = db.execute(
        select(BankTransaction.currency, BankTransaction.kind, func.sum(BankTransaction.amount))
        .where(
            BankTransaction.user_id == user_id,
            BankTransaction.report_month == month,
            BankTransaction.status == "confirmed",
            BankTransaction.kind.in_((*SPENDING_KINDS, "refund")),
        )
        .group_by(BankTransaction.currency, BankTransaction.kind)
    )
    totals: dict[str, dict[str, Decimal]] = {}
    for currency, kind, amount in rows:
        entry = totals.setdefault(currency, {"expenses": Decimal(0), "refunds": Decimal(0)})
        entry["refunds" if kind == "refund" else "expenses"] += amount
    needs_review = db.scalar(
        select(func.count())
        .select_from(BankTransaction)
        .where(BankTransaction.user_id == user_id, BankTransaction.report_month == month, BankTransaction.status == "needs_review")
    )
    return {
        "month": month,
        "timezone": "Asia/Riyadh",
        "totals": {
            currency: {"expenses": float(t["expenses"]), "refunds": float(t["refunds"]), "net": float(t["expenses"] - t["refunds"])}
            for currency, t in totals.items()
        },
        "needs_review": needs_review,
    }
