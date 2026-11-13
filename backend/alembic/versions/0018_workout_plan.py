"""The automatic workout plan.

New tables, all owned by a user: training_plans (one per user: goal, level, the weekdays they train),
planned_workouts (one per day at most, linked to the session made when it is started) and planned_exercises (each
day's exercises, with sets, rep range and rest). Nothing existing is changed or removed.

Downgrading drops the three tables, so the plan and its laid-out days are lost; every logged session stays.

Comes after 0017 (hidden sections).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "training_plans",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("level", sa.Text(), nullable=False),
        sa.Column("weekdays", postgresql.ARRAY(sa.Integer()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("goal in ('strength', 'muscle', 'fitness', 'fat_loss')", name=op.f("training_plans_goal_check")),
        sa.CheckConstraint("level in ('beginner', 'intermediate', 'advanced')", name=op.f("training_plans_level_check")),
        sa.CheckConstraint(
            "cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]", name=op.f("training_plans_weekdays_check")
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("training_plans_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("training_plans_pkey")),
    )
    op.create_table(
        "planned_workouts",
        sa.Column("plan_date", sa.Date(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("rotation", sa.Integer(), nullable=False),
        sa.Column("workout_id", sa.UUID(), nullable=True),
        sa.Column("adjustment", sa.Text(), nullable=True),
        sa.Column("recovery_score", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "adjustment is null or adjustment in ('none', 'rest', 'light', 'normal', 'push')",
            name=op.f("planned_workouts_adjustment_check"),
        ),
        sa.CheckConstraint(
            "kind in ('full_a', 'full_b', 'push', 'pull', 'legs', 'upper', 'lower')", name=op.f("planned_workouts_kind_check")
        ),
        sa.CheckConstraint(
            "recovery_score is null or (recovery_score >= 0 and recovery_score <= 100)", name=op.f("planned_workouts_recovery_score_check")
        ),
        sa.CheckConstraint("rotation >= 0", name=op.f("planned_workouts_rotation_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("planned_workouts_user_id_fkey"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workout_id"], ["workouts.id"], name=op.f("planned_workouts_workout_id_fkey"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("planned_workouts_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("planned_workouts_id_user_id_key")),
        sa.UniqueConstraint("user_id", "plan_date", name=op.f("planned_workouts_user_id_plan_date_key")),
    )
    op.create_table(
        "planned_exercises",
        sa.Column("planned_workout_id", sa.UUID(), nullable=False),
        sa.Column("exercise_id", sa.Text(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("slot", sa.Text(), nullable=False),
        sa.Column("muscle", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("sets", sa.Integer(), nullable=False),
        sa.Column("reps_low", sa.Integer(), nullable=False),
        sa.Column("reps_high", sa.Integer(), nullable=False),
        sa.Column("rest_seconds", sa.Integer(), nullable=False),
        sa.Column("swapped_from", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("char_length(name) between 1 and 160", name=op.f("planned_exercises_name_length_check")),
        sa.CheckConstraint("position >= 0", name=op.f("planned_exercises_position_check")),
        sa.CheckConstraint("reps_low between 1 and 100 and reps_high between reps_low and 100", name=op.f("planned_exercises_reps_check")),
        sa.CheckConstraint("rest_seconds between 0 and 600", name=op.f("planned_exercises_rest_seconds_check")),
        sa.CheckConstraint("sets between 1 and 10", name=op.f("planned_exercises_sets_check")),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], name=op.f("planned_exercises_exercise_id_fkey"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["planned_workout_id", "user_id"],
            ["planned_workouts.id", "planned_workouts.user_id"],
            name=op.f("planned_exercises_planned_workout_id_user_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("planned_exercises_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("planned_exercises_pkey")),
    )
    op.create_index("planned_exercises_user_idx", "planned_exercises", ["user_id"], unique=False)
    op.create_index("planned_exercises_workout_idx", "planned_exercises", ["planned_workout_id", "position"], unique=False)


def downgrade() -> None:
    op.drop_index("planned_exercises_workout_idx", table_name="planned_exercises")
    op.drop_index("planned_exercises_user_idx", table_name="planned_exercises")
    op.drop_table("planned_exercises")
    op.drop_table("planned_workouts")
    op.drop_table("training_plans")
