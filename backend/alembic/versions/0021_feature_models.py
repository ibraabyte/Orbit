"""What each AI feature uses.

One new table, feature_models: per user and feature (the assistant, food by text, plate photo, health summary, Friday
summary, saved-link summary, the mic, the voice call, the phone agent), the model they picked in Integrations. No row
means the default, as before. Nothing existing is changed or removed.

Downgrading drops the table, so every feature goes back to the default.

Comes after 0020 (medications).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FEATURES = "'assistant', 'food_text', 'food_photo', 'health', 'week', 'saver', 'speech', 'call', 'phone_agent'"


def upgrade() -> None:
    op.create_table(
        "feature_models",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("feature", sa.Text(), nullable=False),
        sa.Column("choice", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(f"feature in ({FEATURES})", name=op.f("feature_models_feature_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("feature_models_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "feature", name=op.f("feature_models_pkey")),
    )


def downgrade() -> None:
    op.drop_table("feature_models")
