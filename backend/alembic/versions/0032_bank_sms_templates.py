"""Bank SMS: examples the user pastes, an AI switch, and the bank made optional.

- bank_sms_templates: message shapes learnt from pasted examples. Only placeholders are kept, never the example's values.
- bank_sms_tokens.ai_read: read messages no template matches with the user's own AI (on by default).
- bank_transactions.bank may be empty: the ready Shortcut sends only the message.

Downgrading drops the templates and the switch; rows with no bank are deleted first so the column can be required again.

Comes after 0031 (push devices).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BANKS = "bank in ('rajhi', 'alinma', 'stc', 'd360', 'barq', 'snb')"
KINDS = "kind in ('purchase', 'fee', 'refund', 'transfer_in', 'transfer_out', 'card_payment', 'cash_withdrawal')"


def upgrade() -> None:
    op.create_table(
        "bank_sms_templates",
        sa.Column("bank", sa.Text(), nullable=True),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("pattern", sa.Text(), nullable=False),
        sa.Column("last_matched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(BANKS, name=op.f("bank_sms_templates_bank_check")),
        sa.CheckConstraint(KINDS, name=op.f("bank_sms_templates_kind_check")),
        sa.CheckConstraint("char_length(label) <= 60", name=op.f("bank_sms_templates_label_length_check")),
        sa.CheckConstraint("char_length(pattern) <= 4000", name=op.f("bank_sms_templates_pattern_length_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("bank_sms_tokens", sa.Column("ai_read", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    op.alter_column("bank_transactions", "bank", existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    op.execute("delete from bank_transactions where bank is null")
    op.alter_column("bank_transactions", "bank", existing_type=sa.Text(), nullable=False)
    op.drop_column("bank_sms_tokens", "ai_read")
    op.drop_table("bank_sms_templates")
