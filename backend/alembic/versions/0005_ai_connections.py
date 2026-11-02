"""Each user's own AI: ai_connections (provider, model, encrypted key, instructions).

Only adds a table; no row is changed. Downgrading drops it, and with it any saved AI keys.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-02 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_connections",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("api_key", sa.Text(), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("provider in ('anthropic', 'openai', 'gemini', 'openrouter')", name=op.f("ai_connections_provider_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("ai_connections_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("ai_connections_pkey")),
    )


def downgrade() -> None:
    op.drop_table("ai_connections")
