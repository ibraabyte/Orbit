"""The subscription hunter: what keeps charging you, what isn't in your bills, and a way to act on each.

GET /subscriptions lists the finds of the last scan. POST /subscriptions/scan reads expenses, bank SMS and, when
Gmail is linked, subscription emails, then lists again. Each find can be kept, marked cancelled, set aside as not a
subscription, or tracked as a bill (which adds it to Bills & subscriptions).
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.deps import Db, UserId
from app.models import Bill, SubscriptionFind, SubscriptionScan
from app.routers.gmail import GmailStatus, status_of
from app.routers.plan import user_today
from app.services import subscriptions as hunter

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# Shown first: what needs a decision, then what you keep, then what you set aside.
STATUS_ORDER = {"new": 0, "kept": 1, "tracked": 2, "cancelled": 3, "dismissed": 4}


class FindRow(BaseModel):
    id: uuid.UUID
    key: str
    name: str
    kind: str | None
    period: Literal["weekly", "monthly", "yearly"]
    amount: float | None
    currency: str | None
    previous_amount: float | None
    monthly_cost: float | None
    first_seen_on: date
    last_charged_on: date
    next_expected_on: date | None
    charges: int
    sources: list[str]
    flags: list[str]
    evidence: str | None
    cancel_url: str
    # True when Orbit doesn't know the service's own page and the link is a web search for how to cancel.
    cancel_is_search: bool
    status: Literal["new", "kept", "cancelled", "tracked", "dismissed"]
    bill_id: uuid.UUID | None


class Overview(BaseModel):
    finds: list[FindRow]
    scanned_at: datetime | None
    emails_read: int
    email_error: str | None
    gmail: GmailStatus
    # Per currency, every running subscription as a monthly cost, and the part not in your bills.
    monthly: dict[str, float]
    untracked_monthly: dict[str, float]


class Decision(BaseModel):
    status: Literal["new", "kept", "cancelled", "dismissed"]


class TrackRequest(BaseModel):
    # Needed when Orbit didn't see an amount (an email without a price).
    amount: float | None = Field(default=None, ge=0, le=1_000_000)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    due_at: date | None = None


def _row(find: SubscriptionFind) -> FindRow:
    cost = hunter.monthly_cost(find)
    return FindRow(
        id=find.id,
        key=find.key,
        name=find.name,
        kind=find.kind,
        period=find.period,  # type: ignore[arg-type]
        amount=float(find.amount) if find.amount is not None else None,
        currency=find.currency,
        previous_amount=float(find.previous_amount) if find.previous_amount is not None else None,
        monthly_cost=float(cost) if cost is not None else None,
        first_seen_on=find.first_seen_on,
        last_charged_on=find.last_charged_on,
        next_expected_on=find.next_expected_on,
        charges=find.charges,
        sources=list(find.sources),
        flags=list(find.flags),
        evidence=find.evidence,
        cancel_url=hunter.cancel_link(find),
        cancel_is_search=find.cancel_url is None,
        status=find.status,  # type: ignore[arg-type]
        bill_id=find.bill_id,
    )


def _overview(db: Db, user_id: uuid.UUID) -> Overview:
    rows = list(db.scalars(select(SubscriptionFind).where(SubscriptionFind.user_id == user_id)))
    rows.sort(key=lambda r: (STATUS_ORDER[r.status], -len(r.flags), r.next_expected_on or date.max, r.name.lower()))
    scan = db.get(SubscriptionScan, user_id)
    totals = hunter.summary(rows)
    return Overview(
        finds=[_row(r) for r in rows],
        scanned_at=scan.scanned_at if scan else None,
        emails_read=scan.emails_read if scan else 0,
        email_error=scan.email_error if scan else None,
        gmail=status_of(db, user_id),
        monthly={k: float(v) for k, v in totals["monthly"].items()},
        untracked_monthly={k: float(v) for k, v in totals["untracked_monthly"].items()},
    )


def _find(db: Db, user_id: uuid.UUID, find_id: uuid.UUID) -> SubscriptionFind:
    find = db.get(SubscriptionFind, find_id)
    if find is None or find.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")
    return find


@router.get("", response_model=Overview)
def list_finds(user_id: UserId, db: Db):
    return _overview(db, user_id)


@router.post("/scan", response_model=Overview)
def scan_now(user_id: UserId, db: Db):
    hunter.scan(db, user_id, user_today(db, user_id))
    return _overview(db, user_id)


@router.patch("/{find_id}", response_model=FindRow)
def decide(find_id: uuid.UUID, body: Decision, user_id: UserId, db: Db):
    """Keep it, say you cancelled it, or say it isn't a subscription. Cancelling pauses the bill made from it."""
    find = _find(db, user_id, find_id)
    find.status = body.status
    find.status_changed_at = datetime.now(UTC)
    if body.status == "cancelled":
        find.flags = [f for f in find.flags if f not in {"charged_after_cancel", "trial_ending"}]
        if find.bill_id:
            bill = db.get(Bill, find.bill_id)
            if bill is not None and bill.user_id == user_id and bill.status == "active":
                bill.status = "paused"
    db.commit()
    db.refresh(find)
    return _row(find)


@router.post("/{find_id}/track", response_model=FindRow)
def track(find_id: uuid.UUID, user_id: UserId, db: Db, body: TrackRequest | None = None):
    """Adds it to Bills & subscriptions, due on the next expected charge, and remembers the link."""
    find = _find(db, user_id, find_id)
    body = body or TrackRequest()
    amount = body.amount if body.amount is not None else (float(find.amount) if find.amount is not None else None)
    if amount is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Orbit didn't see the price. Type the amount first.")
    currency = (body.currency or find.currency or "SAR").upper()
    if find.bill_id:
        existing = db.get(Bill, find.bill_id)
        if existing is not None and existing.user_id == user_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "This one is already in your bills.")
    due = body.due_at or find.next_expected_on or user_today(db, user_id)
    bill = Bill(
        user_id=user_id,
        name=find.name,
        amount=Decimal(str(amount)),
        currency=currency,
        category="subscriptions",
        due_at=due,
        recurrence=find.period,
        status="active",
    )
    db.add(bill)
    db.flush()
    find.bill_id = bill.id
    find.status = "tracked"
    find.status_changed_at = datetime.now(UTC)
    find.flags = [f for f in find.flags if f != "untracked"]
    db.commit()
    db.refresh(find)
    return _row(find)
