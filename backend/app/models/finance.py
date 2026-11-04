import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKeyConstraint, Index, Numeric, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at

FINANCE_CATEGORIES = (
    "food",
    "transport",
    "fitness",
    "home",
    "subscriptions",
    "shopping",
    "health",
    "travel",
    "groceries",
    "bills",
    "services",
    "other",
)
_categories_sql = "category in (" + ", ".join(f"'{c}'" for c in FINANCE_CATEGORIES) + ")"


class Expense(Owned, Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("char_length(merchant) <= 220", name="merchant_length"),
        CheckConstraint("amount >= 0", name="amount"),
        CheckConstraint("char_length(currency) = 3", name="currency"),
        CheckConstraint(_categories_sql, name="category"),
        Index("expenses_user_spent_idx", "user_id", text("spent_at desc")),
        Index("expenses_user_category_idx", "user_id", "category", text("spent_at desc")),
    )

    merchant: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(Text, nullable=False, server_default="USD")
    category: Mapped[str] = mapped_column(Text, nullable=False, server_default="other")
    note: Mapped[str | None] = mapped_column(Text)
    spent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Bill(Owned, Base):
    __tablename__ = "bills"
    __table_args__ = (
        CheckConstraint("char_length(name) <= 220", name="name_length"),
        CheckConstraint("amount >= 0", name="amount"),
        CheckConstraint("char_length(currency) = 3", name="currency"),
        CheckConstraint(_categories_sql, name="category"),
        CheckConstraint("recurrence in ('once', 'weekly', 'monthly', 'yearly')", name="recurrence"),
        CheckConstraint("status in ('active', 'paid', 'paused')", name="status"),
        Index("bills_user_due_idx", "user_id", "status", "due_at"),
        # The card it is charged to. Deleting the card keeps the bill and clears only this link.
        ForeignKeyConstraint(["card_id", "user_id"], ["cards.id", "cards.user_id"], ondelete="SET NULL (card_id)"),
        Index("bills_card_idx", "card_id"),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(Text, nullable=False, server_default="USD")
    category: Mapped[str] = mapped_column(Text, nullable=False, server_default="subscriptions")
    due_at: Mapped[date] = mapped_column(Date, nullable=False)
    recurrence: Mapped[str] = mapped_column(Text, nullable=False, server_default="monthly")
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="active")
    autopay: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    note: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = updated_at()
    card_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class Budget(Owned, Base):
    """A spending limit for one category in one month (month is that month's first day). Each month has its own."""

    __tablename__ = "budgets"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount"),
        CheckConstraint("char_length(currency) = 3", name="currency"),
        CheckConstraint(_categories_sql, name="category"),
        CheckConstraint("month = date_trunc('month', month)::date", name="month_first_day"),
        UniqueConstraint("user_id", "month", "category"),
    )

    month: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(Text, nullable=False, server_default="USD")
    updated_at: Mapped[datetime] = updated_at()


CARD_NETWORKS = ("mada", "visa", "mastercard", "amex", "other")
CARD_KINDS = ("credit", "debit", "prepaid")


class Card(Owned, Base):
    """A payment card, named so the user knows which one a subscription is on. Only the last four digits are kept:
    the full number, the security code and the holder's name are never sent or stored."""

    __tablename__ = "cards"
    __table_args__ = (
        CheckConstraint("char_length(name) between 1 and 80", name="name_length"),
        CheckConstraint("last4 ~ '^[0-9]{4}$'", name="last4"),
        CheckConstraint("network in (" + ", ".join(f"'{n}'" for n in CARD_NETWORKS) + ")", name="network"),
        CheckConstraint("kind in (" + ", ".join(f"'{k}'" for k in CARD_KINDS) + ")", name="kind"),
        CheckConstraint("expires_on is null or expires_on = date_trunc('month', expires_on)::date", name="expires_first_day"),
        UniqueConstraint("id", "user_id"),
        Index("cards_user_created_idx", "user_id", "created_at"),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    network: Mapped[str] = mapped_column(Text, nullable=False, server_default="other")
    kind: Mapped[str] = mapped_column(Text, nullable=False, server_default="credit")
    last4: Mapped[str] = mapped_column(Text, nullable=False)
    # The month on the card ("08/28" is 2028-08-01). It works to the end of that month.
    expires_on: Mapped[date | None] = mapped_column(Date)
    updated_at: Mapped[datetime] = updated_at()


MONEY_ACCOUNT_KINDS = ("bank", "savings", "wallet", "cash", "other")


class MoneyAccount(Owned, Base):
    """A place money sits (a bank account, a wallet app, cash at home) with its balance as the user last typed it."""

    __tablename__ = "money_accounts"
    __table_args__ = (
        CheckConstraint("char_length(name) between 1 and 120", name="name_length"),
        CheckConstraint("kind in (" + ", ".join(f"'{k}'" for k in MONEY_ACCOUNT_KINDS) + ")", name="kind"),
        CheckConstraint("char_length(currency) = 3", name="currency"),
        Index("money_accounts_user_created_idx", "user_id", "created_at"),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False, server_default="bank")
    # Can be below zero (an overdrawn account).
    balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0")
    currency: Mapped[str] = mapped_column(Text, nullable=False, server_default="SAR")
    note: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = updated_at()


INVESTMENT_KINDS = ("stocks", "funds", "sukuk", "crowdfunding", "real_estate", "crypto", "gold", "savings", "other")


class Investment(Owned, Base):
    """Money put into one app or portfolio: how much went in and what it is worth now, both typed by the user.
    The return is worked out on the phone, so there is nothing to keep in step."""

    __tablename__ = "investments"
    __table_args__ = (
        CheckConstraint("char_length(name) between 1 and 120", name="name_length"),
        CheckConstraint("kind in (" + ", ".join(f"'{k}'" for k in INVESTMENT_KINDS) + ")", name="kind"),
        CheckConstraint("char_length(currency) = 3", name="currency"),
        CheckConstraint("invested >= 0", name="invested"),
        CheckConstraint("current_value >= 0", name="current_value"),
        Index("investments_user_created_idx", "user_id", "created_at"),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False, server_default="other")
    invested: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    current_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(Text, nullable=False, server_default="SAR")
    started_on: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text)
    # When the current value was last typed, so a stale number is visible.
    valued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = updated_at()


OBLIGATION_KINDS = ("bnpl", "loan", "installment", "other")


class Obligation(Owned, Base):
    """Something paid off in parts: a buy-now-pay-later plan, a loan, a phone on installments.
    What is left is the sum of its unpaid installments."""

    __tablename__ = "obligations"
    __table_args__ = (
        CheckConstraint("char_length(name) between 1 and 120", name="name_length"),
        CheckConstraint("kind in (" + ", ".join(f"'{k}'" for k in OBLIGATION_KINDS) + ")", name="kind"),
        CheckConstraint("char_length(currency) = 3", name="currency"),
        CheckConstraint("total_amount > 0", name="total_amount"),
        UniqueConstraint("id", "user_id"),
        Index("obligations_user_created_idx", "user_id", "created_at"),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False, server_default="bnpl")
    provider: Mapped[str | None] = mapped_column(Text)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(Text, nullable=False, server_default="SAR")
    note: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = updated_at()


class ObligationInstallment(Owned, Base):
    """One payment of an obligation, due on a day. paid_at is set when it is paid."""

    __tablename__ = "obligation_installments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount"),
        ForeignKeyConstraint(["obligation_id", "user_id"], ["obligations.id", "obligations.user_id"], ondelete="CASCADE"),
        Index("obligation_installments_obligation_idx", "obligation_id", "due_on"),
        Index("obligation_installments_user_due_idx", "user_id", "due_on"),
    )

    obligation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    due_on: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
