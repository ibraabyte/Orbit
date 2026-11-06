"""Drops the tables of the sections removed from the app in #26: people, goals, goal_milestones,
journal_entries and focus_sessions. No screen, route or other feature reads them any more (Health's goals live on
the profile, not in goals). THIS DELETES THEIR ROWS FOR GOOD.

Tags pointed at focus sessions (taggings.target_type 'focus_session') are deleted too, and that target type is
no longer allowed. No other table or row is touched.

Downgrading recreates the five empty tables and allows 'focus_session' taggings again; the deleted rows don't
come back.

Comes after 0014 (task lists).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TARGETS = "'task', 'capture', 'meal', 'workout', 'expense', 'bill', 'sleep', {}'meal_plan', 'grocery_item'"


def _tagging_targets(with_focus: bool) -> None:
    op.drop_constraint(op.f("taggings_target_type_check"), "taggings", type_="check")
    targets = _TARGETS.format("'focus_session', " if with_focus else "")
    op.create_check_constraint(op.f("taggings_target_type_check"), "taggings", f"target_type in ({targets})")


def upgrade() -> None:
    op.execute("delete from taggings where target_type = 'focus_session'")
    _tagging_targets(with_focus=False)
    # Milestones first: they point at goals.
    for table in ("goal_milestones", "goals", "journal_entries", "people", "focus_sessions"):
        op.drop_table(table)


def downgrade() -> None:
    op.create_table(
        "goals",
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        sa.Column("target_at", sa.Date(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status in ('active', 'completed', 'archived')", name=op.f("goals_status_check")),
        sa.CheckConstraint("char_length(title) <= 220", name=op.f("goals_title_length_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("goals_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("goals_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("goals_id_user_id_key")),
    )
    op.create_index("goals_user_status_idx", "goals", ["user_id", "status", sa.literal_column("updated_at desc")], unique=False)
    op.create_table(
        "goal_milestones",
        sa.Column("goal_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("char_length(title) <= 220", name=op.f("goal_milestones_title_length_check")),
        sa.ForeignKeyConstraint(
            ["goal_id", "user_id"], ["goals.id", "goals.user_id"], name=op.f("goal_milestones_goal_id_user_id_fkey"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("goal_milestones_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("goal_milestones_pkey")),
    )
    op.create_index("goal_milestones_goal_idx", "goal_milestones", ["goal_id", "completed_at"], unique=False)
    op.create_index("goal_milestones_user_created_idx", "goal_milestones", ["user_id", sa.literal_column("created_at desc")], unique=False)
    op.create_table(
        "journal_entries",
        sa.Column("mood", sa.Text(), server_default="neutral", nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("mood in ('great', 'good', 'neutral', 'low', 'bad')", name=op.f("journal_entries_mood_check")),
        sa.CheckConstraint("char_length(title) <= 220", name=op.f("journal_entries_title_length_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("journal_entries_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("journal_entries_pkey")),
        sa.UniqueConstraint("user_id", "entry_date", name=op.f("journal_entries_user_id_entry_date_key")),
    )
    op.create_index("journal_entries_user_date_idx", "journal_entries", ["user_id", sa.literal_column("entry_date desc")], unique=False)
    op.create_table(
        "people",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("relationship", sa.Text(), nullable=True),
        sa.Column("contact_method", sa.Text(), nullable=True),
        sa.Column("birthday", sa.Date(), nullable=True),
        sa.Column("last_contacted_at", sa.Date(), nullable=True),
        sa.Column("next_follow_up_at", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("favorite", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("people_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("people_pkey")),
    )
    op.create_index("people_user_birthday_idx", "people", ["user_id", "birthday"], unique=False)
    op.create_index("people_user_favorite_idx", "people", ["user_id", "favorite"], unique=False)
    op.create_index("people_user_followup_idx", "people", ["user_id", "next_follow_up_at"], unique=False)
    op.create_index("people_user_name_idx", "people", ["user_id", "name"], unique=False)
    op.create_index("people_user_updated_idx", "people", ["user_id", sa.literal_column("updated_at desc")], unique=False)
    op.create_table(
        "focus_sessions",
        sa.Column("task_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.Text(), server_default="completed", nullable=False),
        sa.Column("energy", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status in ('planned', 'completed', 'cancelled')", name=op.f("focus_sessions_status_check")),
        sa.CheckConstraint("char_length(title) <= 220", name=op.f("focus_sessions_title_length_check")),
        sa.CheckConstraint("duration_minutes >= 0 and duration_minutes <= 1440", name=op.f("focus_sessions_duration_minutes_check")),
        sa.CheckConstraint("energy is null or (energy >= 1 and energy <= 5)", name=op.f("focus_sessions_energy_check")),
        sa.ForeignKeyConstraint(
            ["task_id", "user_id"],
            ["tasks.id", "tasks.user_id"],
            name=op.f("focus_sessions_task_id_user_id_fkey"),
            ondelete="SET NULL (task_id)",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("focus_sessions_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("focus_sessions_pkey")),
    )
    op.create_index("focus_sessions_task_idx", "focus_sessions", ["task_id", sa.literal_column("started_at desc")], unique=False)
    op.create_index("focus_sessions_user_started_idx", "focus_sessions", ["user_id", sa.literal_column("started_at desc")], unique=False)
    op.create_index("focus_sessions_user_status_idx", "focus_sessions", ["user_id", "status", "started_at"], unique=False)
    _tagging_targets(with_focus=True)
