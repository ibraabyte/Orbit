"""Gym sessions logged set by set, and body measurements.

New tables, all owned by a user: workout_exercises (the exercises of a session, in order), workout_sets (weight x
reps, ticked when done) and body_measurements (waist, chest, arms... one number per row). On workouts it adds
in_progress (false for every existing row, so nothing changes for them) and a unique (id, user_id), so a session's
exercises can only join their owner's own workouts. No existing row is changed or removed.

Downgrading drops the three new tables and the two additions to workouts, so sessions' exercises and sets and the
body measurements logged since are lost; the workouts themselves stay.

Comes after 0015 (drop orphaned tables).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("workouts", sa.Column("in_progress", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.create_unique_constraint(op.f("workouts_id_user_id_key"), "workouts", ["id", "user_id"])
    op.create_table(
        "body_measurements",
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("value", sa.Numeric(), nullable=False),
        sa.Column("unit", sa.Text(), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "(kind = 'body_fat' and unit = '%') or (kind <> 'body_fat' and unit in ('cm', 'in'))", name=op.f("body_measurements_unit_check")
        ),
        sa.CheckConstraint(
            "kind in ('waist', 'chest', 'hips', 'arm', 'thigh', 'calf', 'neck', 'shoulders', 'body_fat')",
            name=op.f("body_measurements_kind_check"),
        ),
        sa.CheckConstraint("char_length(note) <= 500", name=op.f("body_measurements_note_length_check")),
        sa.CheckConstraint("value > 0 and value < 1000", name=op.f("body_measurements_value_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("body_measurements_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("body_measurements_pkey")),
    )
    op.create_index(
        "body_measurements_user_kind_idx", "body_measurements", ["user_id", "kind", sa.literal_column("measured_at desc")], unique=False
    )
    op.create_table(
        "workout_exercises",
        sa.Column("workout_id", sa.UUID(), nullable=False),
        sa.Column("exercise_id", sa.Text(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("rest_seconds", sa.Integer(), server_default="90", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("char_length(name) between 1 and 160", name=op.f("workout_exercises_name_length_check")),
        sa.CheckConstraint("char_length(note) <= 500", name=op.f("workout_exercises_note_length_check")),
        sa.CheckConstraint("position >= 0", name=op.f("workout_exercises_position_check")),
        sa.CheckConstraint("rest_seconds >= 0 and rest_seconds <= 600", name=op.f("workout_exercises_rest_seconds_check")),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], name=op.f("workout_exercises_exercise_id_fkey"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("workout_exercises_user_id_fkey"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["workout_id", "user_id"],
            ["workouts.id", "workouts.user_id"],
            name=op.f("workout_exercises_workout_id_user_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("workout_exercises_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("workout_exercises_id_user_id_key")),
    )
    op.create_index("workout_exercises_user_exercise_idx", "workout_exercises", ["user_id", "exercise_id"], unique=False)
    op.create_index("workout_exercises_user_name_idx", "workout_exercises", ["user_id", sa.literal_column("lower(name)")], unique=False)
    op.create_index("workout_exercises_workout_idx", "workout_exercises", ["workout_id", "position"], unique=False)
    op.create_table(
        "workout_sets",
        sa.Column("workout_exercise_id", sa.UUID(), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("reps", sa.Integer(), nullable=True),
        sa.Column("weight", sa.Numeric(), nullable=True),
        sa.Column("unit", sa.Text(), server_default="kg", nullable=False),
        sa.Column("warmup", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("done", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("unit in ('kg', 'lb')", name=op.f("workout_sets_unit_check")),
        sa.CheckConstraint("position >= 0", name=op.f("workout_sets_position_check")),
        sa.CheckConstraint("reps is null or (reps >= 0 and reps <= 1000)", name=op.f("workout_sets_reps_check")),
        sa.CheckConstraint("weight is null or (weight >= 0 and weight < 2000)", name=op.f("workout_sets_weight_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("workout_sets_user_id_fkey"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["workout_exercise_id", "user_id"],
            ["workout_exercises.id", "workout_exercises.user_id"],
            name=op.f("workout_sets_workout_exercise_id_user_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("workout_sets_pkey")),
    )
    op.create_index("workout_sets_exercise_idx", "workout_sets", ["workout_exercise_id", "position"], unique=False)
    op.create_index("workout_sets_user_idx", "workout_sets", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("workout_sets_user_idx", table_name="workout_sets")
    op.drop_index("workout_sets_exercise_idx", table_name="workout_sets")
    op.drop_table("workout_sets")
    op.drop_index("workout_exercises_workout_idx", table_name="workout_exercises")
    op.drop_index("workout_exercises_user_name_idx", table_name="workout_exercises")
    op.drop_index("workout_exercises_user_exercise_idx", table_name="workout_exercises")
    op.drop_table("workout_exercises")
    op.drop_constraint(op.f("workouts_id_user_id_key"), "workouts", type_="unique")
    op.drop_column("workouts", "in_progress")
    op.drop_index("body_measurements_user_kind_idx", table_name="body_measurements")
    op.drop_table("body_measurements")
