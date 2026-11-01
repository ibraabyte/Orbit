"""Bank SMS sent by the user's iPhone Shortcut. The message text and bank reference are never stored, only what was
read from them and keyed hashes (message_mac, reference_mac) to spot repeats.

A transaction reaches `expenses` only once it is confirmed, and only if it is a purchase or a fee.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, created_at, updated_at
from app.models.finance import FINANCE_CATEGORIES

BANKS = ("rajhi", "alinma", "stc", "d360", "barq", "snb")
KINDS = ("purchase", "fee", "refund", "transfer_in", "transfer_out", "card_payment", "cash_withdrawal", "unknown")
STATUSES = ("needs_review", "confirmed", "ignored")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} in (" + ", ".join(f"'{value}'" for value in values) + ")"


class BankSmsToken(Base):
    """The long-lived key a Shortcut sends. One per user, kept hashed, shown once when created."""

    __tablename__ = "bank_sms_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    created_at: Mapped[datetime] = created_at()
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BankTransaction(Owned, Base):
    __tablename__ = "bank_transactions"
    __table_args__ = (
        CheckConstraint(_in("bank", BANKS), name="bank"),
        CheckConstraint(_in("kind", KINDS), name="kind"),
        CheckConstraint(_in("status", STATUSES), name="status"),
        CheckConstraint(_in("category", FINANCE_CATEGORIES), name="category"),
        UniqueConstraint("user_id", "reference_mac"),
        Index("bank_transactions_user_month_idx", "user_id", "report_month", "status"),
        Index("bank_transactions_user_message_idx", "user_id", "message_mac", "created_at"),
    )

    bank: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str | None] = mapped_column(Text)
    merchant: Mapped[str | None] = mapped_column(Text)
    card_last4: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text, nullable=False, server_default="other")
    status: Mapped[str] = mapped_column(Text, nullable=False)
    review_reasons: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # YYYY-MM in Riyadh time, from when the SMS arrived; the bank's own date isn't read.
    report_month: Mapped[str] = mapped_column(Text, nullable=False)
    message_mac: Mapped[str] = mapped_column(Text, nullable=False)
    reference_mac: Mapped[str | None] = mapped_column(Text)
    expense_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = updated_at()


class BankSmsEvent(Base):
    """One row per delivery, so a Shortcut retry with the same event_id gets the earlier answer."""

    __tablename__ = "bank_sms_events"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    message_mac: Mapped[str] = mapped_column(Text, nullable=False)
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bank_transactions.id", ondelete="CASCADE"), nullable=False
    )
