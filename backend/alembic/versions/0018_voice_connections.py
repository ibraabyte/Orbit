"""Optional voice model for the assistant's mic.

Adds voice_connections: at most one row per user with the speech-to-text provider (OpenAI, Groq or ElevenLabs), the
model and the user's own key, encrypted. It is a new, empty table; no existing row is changed or removed.

Downgrading drops the table, so saved voice models are forgotten and the mic goes back to on-phone speech to text.

Comes after 0017 (hidden sections).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "voice_connections",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("api_key", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("provider in ('openai', 'groq', 'elevenlabs')", name=op.f("voice_connections_provider_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("voice_connections_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("voice_connections_pkey")),
    )


def downgrade() -> None:
    op.drop_table("voice_connections")
