"""Subscription hunter and read-only Gmail.

Three new tables, nothing existing is changed:
- gmail_connections: one per user, the Google account linked for reading mail, tokens encrypted.
- subscription_finds: recurring charges the hunter found, and what the user decided about each.
- subscription_scans: when the hunter last ran for a user.

Downgrading drops the three tables: the Gmail link (connect again) and the finds (scan again). Bills made from finds
stay.

Comes after 0024 (Apple Health).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "gmail_connections",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scope", sa.Text(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("gmail_connections_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("gmail_connections_pkey")),
    )
    op.create_table(
        "subscription_scans",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("emails_read", sa.Integer(), server_default="0", nullable=False),
        sa.Column("email_error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("subscription_scans_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("subscription_scans_pkey")),
    )
    op.create_table(
        "subscription_finds",
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("currency", sa.Text(), nullable=True),
        sa.Column("previous_amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("period", sa.Text(), server_default="monthly", nullable=False),
        sa.Column("first_seen_on", sa.Date(), nullable=False),
        sa.Column("last_charged_on", sa.Date(), nullable=False),
        sa.Column("next_expected_on", sa.Date(), nullable=True),
        sa.Column("charges", sa.Integer(), server_default="1", nullable=False),
        sa.Column("sources", sa.ARRAY(sa.Text()), server_default="{}", nullable=False),
        sa.Column("flags", sa.ARRAY(sa.Text()), server_default="{}", nullable=False),
        sa.Column("evidence", sa.Text(), nullable=True),
        sa.Column("kind", sa.Text(), nullable=True),
        sa.Column("cancel_url", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="new", nullable=False),
        sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("bill_id", sa.UUID(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("period in ('weekly', 'monthly', 'yearly')", name=op.f("subscription_finds_period_check")),
        sa.CheckConstraint("status in ('new', 'kept', 'cancelled', 'tracked', 'dismissed')", name=op.f("subscription_finds_status_check")),
        sa.CheckConstraint("char_length(name) <= 120", name=op.f("subscription_finds_name_length_check")),
        sa.CheckConstraint("currency is null or char_length(currency) = 3", name=op.f("subscription_finds_currency_check")),
        sa.ForeignKeyConstraint(["bill_id"], ["bills.id"], name=op.f("subscription_finds_bill_id_fkey"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("subscription_finds_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("subscription_finds_pkey")),
        sa.UniqueConstraint("user_id", "key", name=op.f("subscription_finds_user_id_key_key")),
    )
    op.create_index("subscription_finds_user_status_idx", "subscription_finds", ["user_id", "status"], unique=False)


def downgrade() -> None:
    op.drop_index("subscription_finds_user_status_idx", table_name="subscription_finds")
    op.drop_table("subscription_finds")
    op.drop_table("subscription_scans")
    op.drop_table("gmail_connections")
