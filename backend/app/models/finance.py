from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Index, Numeric, Text, text
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
