"""Exercise library (free-exercise-db, public domain) plus each user's gym equipment and injuries.

Only adds tables. The catalogue rows come from app/data/free_exercise_db.json, so this needs no network.
Downgrade drops the three new tables (and with them any gym equipment and injuries saved since).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.services.exercise_catalog import load_catalog

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

GYM_EQUIPMENT = "'barbell', 'dumbbell', 'e-z curl bar', 'kettlebells', 'cable', 'machine', 'bands', 'medicine ball', 'exercise ball', 'foam roll', 'other'"
INJURY_AREAS = (
    "'neck', 'shoulder', 'elbow', 'wrist', 'upper back', 'lower back', 'hip', 'knee', 'ankle', "
    "'abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings', "
    "'lats', 'middle back', 'quadriceps', 'shoulders', 'traps', 'triceps'"
)


def upgrade() -> None:
    exercises = op.create_table(
        "exercises",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("level", sa.Text(), nullable=False),
        sa.Column("force", sa.Text(), nullable=True),
        sa.Column("mechanic", sa.Text(), nullable=True),
        sa.Column("equipment", sa.Text(), nullable=True),
        sa.Column("primary_muscles", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("secondary_muscles", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("instructions", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("images", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("exercises_pkey")),
    )
    op.create_table(
        "gym_equipment",
        sa.Column("equipment", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(f"equipment in ({GYM_EQUIPMENT})", name=op.f("gym_equipment_equipment_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("gym_equipment_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("gym_equipment_pkey")),
        sa.UniqueConstraint("user_id", "equipment", name=op.f("gym_equipment_user_id_equipment_key")),
    )
    op.create_table(
        "injuries",
        sa.Column("area", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("started_on", sa.Date(), nullable=True),
        sa.Column("ended_on", sa.Date(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(f"area in ({INJURY_AREAS})", name=op.f("injuries_area_check")),
        sa.CheckConstraint("char_length(note) <= 500", name=op.f("injuries_note_length_check")),
        sa.CheckConstraint("ended_on is null or started_on is null or ended_on >= started_on", name=op.f("injuries_dates_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("injuries_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("injuries_pkey")),
    )
    op.create_index("injuries_user_idx", "injuries", ["user_id", "active", sa.text("created_at DESC")], unique=False)

    op.bulk_insert(exercises, list(load_catalog()))


def downgrade() -> None:
    op.drop_index("injuries_user_idx", table_name="injuries")
    op.drop_table("injuries")
    op.drop_table("gym_equipment")
    op.drop_table("exercises")
