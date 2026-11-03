"""Monthly budgets: one spending limit per category per month, owned by a user and deleted with the account."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CATEGORIES = "category in ('food', 'transport', 'fitness', 'home', 'subscriptions', 'shopping', 'health', 'travel', 'groceries', 'bills', 'services', 'other')"


def upgrade() -> None:
    op.create_table(
        "budgets",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.Text(), server_default="USD", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount > 0", name=op.f("budgets_amount_check")),
        sa.CheckConstraint("char_length(currency) = 3", name=op.f("budgets_currency_check")),
        sa.CheckConstraint(CATEGORIES, name=op.f("budgets_category_check")),
        sa.CheckConstraint("month = date_trunc('month', month)::date", name=op.f("budgets_month_first_day_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("budgets_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("budgets_pkey")),
        sa.UniqueConstraint("user_id", "month", "category", name=op.f("budgets_user_id_month_category_key")),
    )


def downgrade() -> None:
    op.drop_table("budgets")
