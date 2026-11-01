"""Bank SMS: bank_transactions (what was read from each SMS, awaiting review), bank_sms_events (delivery retries),
bank_sms_tokens (the iPhone Shortcut's hashed key), and three more finance categories: groceries, bills, services.

Only adds tables and widens two checks; no row changes. Downgrading drops these tables with their data and moves any
expense or bill in the new categories to 'other'.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-01 17:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD = "category in ('food', 'transport', 'fitness', 'home', 'subscriptions', 'shopping', 'health', 'travel', 'other')"
NEW = "category in ('food', 'transport', 'fitness', 'home', 'subscriptions', 'shopping', 'health', 'travel', 'groceries', 'bills', 'services', 'other')"
BANKS = "bank in ('rajhi', 'alinma', 'stc', 'd360', 'barq', 'snb')"
KINDS = "kind in ('purchase', 'fee', 'refund', 'transfer_in', 'transfer_out', 'card_payment', 'cash_withdrawal', 'unknown')"
STATUSES = "status in ('needs_review', 'confirmed', 'ignored')"


def _set_categories(check: str) -> None:
    for table in ("expenses", "bills"):
        op.drop_constraint(op.f(f"{table}_category_check"), table, type_="check")
        op.create_check_constraint(op.f(f"{table}_category_check"), table, check)


def upgrade() -> None:
    _set_categories(NEW)
    op.create_table(
        "bank_sms_tokens",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("bank_sms_tokens_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("bank_sms_tokens_pkey")),
        sa.UniqueConstraint("token_hash", name=op.f("bank_sms_tokens_token_hash_key")),
    )
    op.create_table(
        "bank_transactions",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("bank", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.Text(), nullable=True),
        sa.Column("merchant", sa.Text(), nullable=True),
        sa.Column("card_last4", sa.Text(), nullable=True),
        sa.Column("category", sa.Text(), server_default="other", nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("review_reasons", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("report_month", sa.Text(), nullable=False),
        sa.Column("message_mac", sa.Text(), nullable=False),
        sa.Column("reference_mac", sa.Text(), nullable=True),
        sa.Column("expense_id", sa.UUID(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(BANKS, name=op.f("bank_transactions_bank_check")),
        sa.CheckConstraint(KINDS, name=op.f("bank_transactions_kind_check")),
        sa.CheckConstraint(STATUSES, name=op.f("bank_transactions_status_check")),
        sa.CheckConstraint(NEW, name=op.f("bank_transactions_category_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("bank_transactions_user_id_fkey"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["expense_id"], ["expenses.id"], name=op.f("bank_transactions_expense_id_fkey"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("bank_transactions_pkey")),
        sa.UniqueConstraint("user_id", "reference_mac", name=op.f("bank_transactions_user_id_reference_mac_key")),
    )
    op.create_index("bank_transactions_user_month_idx", "bank_transactions", ["user_id", "report_month", "status"])
    op.create_index("bank_transactions_user_message_idx", "bank_transactions", ["user_id", "message_mac", "created_at"])
    op.create_table(
        "bank_sms_events",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("message_mac", sa.Text(), nullable=False),
        sa.Column("transaction_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("bank_sms_events_user_id_fkey"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["transaction_id"], ["bank_transactions.id"], name=op.f("bank_sms_events_transaction_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "event_id", name=op.f("bank_sms_events_pkey")),
    )


def downgrade() -> None:
    op.drop_table("bank_sms_events")
    op.drop_table("bank_transactions")
    op.drop_table("bank_sms_tokens")
    for table in ("expenses", "bills"):
        op.execute(f"update {table} set category = 'other' where category in ('groceries', 'bills', 'services')")
    _set_categories(OLD)
