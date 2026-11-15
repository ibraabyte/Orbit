"""Gmail (read-only) and the subscription hunter.

GmailConnection is one per user: the Google account they linked for reading mail, with its tokens encrypted. Other
features (the subscription hunter now, an order tracker later) read mail through app/services/gmail_api.py.

SubscriptionFind is one row per recurring charge the hunter found, keyed by a normalised merchant name, with what the
user decided about it (keep, cancelled, tracked as a bill, not a subscription).
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    ARRAY,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, created_at, updated_at

FIND_STATUSES = ("new", "kept", "cancelled", "tracked", "dismissed")
FIND_PERIODS = ("weekly", "monthly", "yearly")
_statuses_sql = ", ".join(f"'{s}'" for s in FIND_STATUSES)
_periods_sql = ", ".join(f"'{p}'" for p in FIND_PERIODS)


class GmailConnection(Base):
    __tablename__ = "gmail_connections"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    # Both encrypted with app.security.encrypt_secret.
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scope: Mapped[str | None] = mapped_column(Text)
    # The last time Google refused the tokens or a read failed, in words for the app. Cleared on success.
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()


class SubscriptionFind(Owned, Base):
    __tablename__ = "subscription_finds"
    __table_args__ = (
        UniqueConstraint("user_id", "key"),
        CheckConstraint(f"status in ({_statuses_sql})", name="status"),
        CheckConstraint(f"period in ({_periods_sql})", name="period"),
        CheckConstraint("char_length(name) <= 120", name="name_length"),
        CheckConstraint("currency is null or char_length(currency) = 3", name="currency"),
        Index("subscription_finds_user_status_idx", "user_id", "status"),
        # The bill made from it. Deleting the bill keeps the find and clears only this link.
        ForeignKeyConstraint(["bill_id"], ["bills.id"], ondelete="SET NULL"),
    )

    # The normalised merchant, like "netflix". One row per key per user.
    key: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str | None] = mapped_column(Text)
    # The amount before the last change, when it went up.
    previous_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    period: Mapped[str] = mapped_column(Text, nullable=False, server_default="monthly")
    first_seen_on: Mapped[date] = mapped_column(Date, nullable=False)
    last_charged_on: Mapped[date] = mapped_column(Date, nullable=False)
    next_expected_on: Mapped[date | None] = mapped_column(Date)
    charges: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    # Where it was seen: expenses, bank (SMS), email.
    sources: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    # What needs a look: untracked, price_up, trial_ending, duplicate, charged_after_cancel.
    flags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    # A short line on why Orbit thinks so, like an email subject.
    evidence: Mapped[str | None] = mapped_column(Text)
    # What sort of service it is (video, music, cloud, ai, ...), to spot two of the same.
    kind: Mapped[str | None] = mapped_column(Text)
    cancel_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="new")
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    bill_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    updated_at: Mapped[datetime] = updated_at()


class SubscriptionScan(Base):
    """When the hunter last ran for a user, and what it read."""

    __tablename__ = "subscription_scans"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    emails_read: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    email_error: Mapped[str | None] = mapped_column(Text)
