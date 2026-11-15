"""Apple Health days.

One new table, apple_health_days: per user and local day, the totals the phone read from Apple Health (steps, active
energy, sleep, workouts, heart rate, HRV, weight). Nothing existing is changed.

Downgrading drops the table and the synced days with it; the phone can send them again.

Comes after 0023 (smart saver).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "apple_health_days",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("steps", sa.Integer(), nullable=True),
        sa.Column("active_kcal", sa.Float(), nullable=True),
        sa.Column("sleep_minutes", sa.Integer(), nullable=True),
        sa.Column("workouts", sa.Integer(), nullable=True),
        sa.Column("workout_minutes", sa.Integer(), nullable=True),
        sa.Column("resting_hr", sa.Float(), nullable=True),
        sa.Column("average_hr", sa.Float(), nullable=True),
        sa.Column("hrv_sdnn", sa.Float(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("apple_health_days_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("apple_health_days_pkey")),
        sa.UniqueConstraint("user_id", "date", name=op.f("apple_health_days_user_id_date_key")),
    )


def downgrade() -> None:
    op.drop_table("apple_health_days")
