"""Finance expansion: cards (last four digits only), where money is, investments, obligations with their
installments, and an optional card on each bill. All new and owned by a user; nothing existing is changed or removed.

Numbered 0011, not 0009, so it does not collide with the two migrations waiting in other branches.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cards",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("network", sa.Text(), server_default="other", nullable=False),
        sa.Column("kind", sa.Text(), server_default="credit", nullable=False),
        sa.Column("last4", sa.Text(), nullable=False),
        sa.Column("expires_on", sa.Date(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "expires_on is null or expires_on = date_trunc('month', expires_on)::date", name=op.f("cards_expires_first_day_check")
        ),
        sa.CheckConstraint("kind in ('credit', 'debit', 'prepaid')", name=op.f("cards_kind_check")),
        sa.CheckConstraint("last4 ~ '^[0-9]{4}$'", name=op.f("cards_last4_check")),
        sa.CheckConstraint("network in ('mada', 'visa', 'mastercard', 'amex', 'other')", name=op.f("cards_network_check")),
        sa.CheckConstraint("char_length(name) between 1 and 80", name=op.f("cards_name_length_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("cards_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("cards_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("cards_id_user_id_key")),
    )
    op.create_index("cards_user_created_idx", "cards", ["user_id", "created_at"], unique=False)
    op.create_table(
        "investments",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), server_default="other", nullable=False),
        sa.Column("invested", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("current_value", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.Text(), server_default="SAR", nullable=False),
        sa.Column("started_on", sa.Date(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("valued_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "kind in ('stocks', 'funds', 'sukuk', 'crowdfunding', 'real_estate', 'crypto', 'gold', 'savings', 'other')",
            name=op.f("investments_kind_check"),
        ),
        sa.CheckConstraint("char_length(currency) = 3", name=op.f("investments_currency_check")),
        sa.CheckConstraint("char_length(name) between 1 and 120", name=op.f("investments_name_length_check")),
        sa.CheckConstraint("current_value >= 0", name=op.f("investments_current_value_check")),
        sa.CheckConstraint("invested >= 0", name=op.f("investments_invested_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("investments_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("investments_pkey")),
    )
    op.create_index("investments_user_created_idx", "investments", ["user_id", "created_at"], unique=False)
    op.create_table(
        "money_accounts",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), server_default="bank", nullable=False),
        sa.Column("balance", sa.Numeric(precision=14, scale=2), server_default="0", nullable=False),
        sa.Column("currency", sa.Text(), server_default="SAR", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("kind in ('bank', 'savings', 'wallet', 'cash', 'other')", name=op.f("money_accounts_kind_check")),
        sa.CheckConstraint("char_length(currency) = 3", name=op.f("money_accounts_currency_check")),
        sa.CheckConstraint("char_length(name) between 1 and 120", name=op.f("money_accounts_name_length_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("money_accounts_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("money_accounts_pkey")),
    )
    op.create_index("money_accounts_user_created_idx", "money_accounts", ["user_id", "created_at"], unique=False)
    op.create_table(
        "obligations",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), server_default="bnpl", nullable=False),
        sa.Column("provider", sa.Text(), nullable=True),
        sa.Column("total_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.Text(), server_default="SAR", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("kind in ('bnpl', 'loan', 'installment', 'other')", name=op.f("obligations_kind_check")),
        sa.CheckConstraint("char_length(currency) = 3", name=op.f("obligations_currency_check")),
        sa.CheckConstraint("char_length(name) between 1 and 120", name=op.f("obligations_name_length_check")),
        sa.CheckConstraint("total_amount > 0", name=op.f("obligations_total_amount_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("obligations_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("obligations_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("obligations_id_user_id_key")),
    )
    op.create_index("obligations_user_created_idx", "obligations", ["user_id", "created_at"], unique=False)
    op.create_table(
        "obligation_installments",
        sa.Column("obligation_id", sa.UUID(), nullable=False),
        sa.Column("due_on", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount > 0", name=op.f("obligation_installments_amount_check")),
        sa.ForeignKeyConstraint(
            ["obligation_id", "user_id"],
            ["obligations.id", "obligations.user_id"],
            name=op.f("obligation_installments_obligation_id_user_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("obligation_installments_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("obligation_installments_pkey")),
    )
    op.create_index("obligation_installments_obligation_idx", "obligation_installments", ["obligation_id", "due_on"], unique=False)
    op.create_index("obligation_installments_user_due_idx", "obligation_installments", ["user_id", "due_on"], unique=False)
    op.add_column("bills", sa.Column("card_id", sa.UUID(), nullable=True))
    op.create_index("bills_card_idx", "bills", ["card_id"], unique=False)
    op.create_foreign_key(
        op.f("bills_card_id_user_id_fkey"), "bills", "cards", ["card_id", "user_id"], ["id", "user_id"], ondelete="SET NULL (card_id)"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("bills_card_id_user_id_fkey"), "bills", type_="foreignkey")
    op.drop_index("bills_card_idx", table_name="bills")
    op.drop_column("bills", "card_id")
    op.drop_index("obligation_installments_user_due_idx", table_name="obligation_installments")
    op.drop_index("obligation_installments_obligation_idx", table_name="obligation_installments")
    op.drop_table("obligation_installments")
    op.drop_index("obligations_user_created_idx", table_name="obligations")
    op.drop_table("obligations")
    op.drop_index("money_accounts_user_created_idx", table_name="money_accounts")
    op.drop_table("money_accounts")
    op.drop_index("investments_user_created_idx", table_name="investments")
    op.drop_table("investments")
    op.drop_index("cards_user_created_idx", table_name="cards")
    op.drop_table("cards")
