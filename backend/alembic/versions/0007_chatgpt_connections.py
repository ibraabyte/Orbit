"""Encrypted per-user ChatGPT OAuth connections. Existing AI keys are unchanged."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chatgpt_connections",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("verifier", sa.Text(), nullable=True),
        sa.Column("state", sa.Text(), nullable=True),
        sa.Column("pending_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("credentials", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status in ('pending', 'connected', 'expired')", name=op.f("chatgpt_connections_status_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("chatgpt_connections_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("chatgpt_connections_pkey")),
    )


def downgrade() -> None:
    op.drop_table("chatgpt_connections")
