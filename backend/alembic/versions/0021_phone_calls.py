"""Phone agent: the user's own Twilio account and the calls the agent makes for them.

Adds phone_connections (at most one row per user: Twilio account SID, the auth token encrypted, the number calls go
out from, the agent's voice) and phone_calls (one row per call: the approved plan, its progress, the outcome, a short
summary and the words said; a booked appointment's task). Both are new, empty tables; no existing row is changed.

Downgrading drops both tables, so the saved Twilio account and every past call are forgotten. Tasks made from
bookings stay.

Comes after 0020 (medications).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "phone_connections",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("account_sid", sa.Text(), nullable=False),
        sa.Column("auth_token", sa.Text(), nullable=False),
        sa.Column("from_number", sa.Text(), nullable=False),
        sa.Column("voice", sa.Text(), server_default="marin", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("from_number ~ '^\\+[1-9][0-9]{7,14}$'", name=op.f("phone_connections_from_number_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("phone_connections_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("phone_connections_pkey")),
    )
    op.create_table(
        "phone_calls",
        sa.Column("business_name", sa.Text(), nullable=False),
        sa.Column("to_number", sa.Text(), nullable=False),
        sa.Column("request", sa.Text(), nullable=False),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("opening", sa.Text(), nullable=False),
        sa.Column("allowed", sa.Text(), nullable=True),
        sa.Column("caller_name", sa.Text(), nullable=True),
        sa.Column("task_title", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="draft", nullable=False),
        sa.Column("outcome", sa.Text(), nullable=True),
        sa.Column("appointment_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("transcript", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("twilio_sid", sa.Text(), nullable=True),
        sa.Column("stream_key", sa.Text(), nullable=True),
        sa.Column("task_id", sa.UUID(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("outcome is distinct from 'booked' or appointment_at is not null", name=op.f("phone_calls_booked_time_check")),
        sa.CheckConstraint(
            "outcome is null or outcome in ('booked', 'not_booked', 'needs_you', 'no_answer')", name=op.f("phone_calls_outcome_check")
        ),
        sa.CheckConstraint(
            "status in ('draft', 'calling', 'in_progress', 'ended', 'failed', 'canceled')", name=op.f("phone_calls_status_check")
        ),
        sa.CheckConstraint("to_number ~ '^\\+[1-9][0-9]{7,14}$'", name=op.f("phone_calls_to_number_check")),
        sa.CheckConstraint("char_length(business_name) between 1 and 120", name=op.f("phone_calls_business_name_length_check")),
        sa.CheckConstraint("char_length(goal) between 1 and 500", name=op.f("phone_calls_goal_length_check")),
        sa.CheckConstraint("char_length(opening) between 1 and 300", name=op.f("phone_calls_opening_length_check")),
        sa.CheckConstraint("char_length(request) between 1 and 500", name=op.f("phone_calls_request_length_check")),
        sa.ForeignKeyConstraint(
            ["task_id", "user_id"],
            ["tasks.id", "tasks.user_id"],
            name=op.f("phone_calls_task_id_user_id_fkey"),
            ondelete="SET NULL (task_id)",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("phone_calls_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("phone_calls_pkey")),
    )
    op.create_index(
        "phone_calls_twilio_sid_idx", "phone_calls", ["twilio_sid"], unique=True, postgresql_where=sa.text("twilio_sid is not null")
    )
    op.create_index("phone_calls_user_created_idx", "phone_calls", ["user_id", sa.literal_column("created_at desc")], unique=False)


def downgrade() -> None:
    op.drop_index("phone_calls_user_created_idx", table_name="phone_calls")
    op.drop_index("phone_calls_twilio_sid_idx", table_name="phone_calls", postgresql_where=sa.text("twilio_sid is not null"))
    op.drop_table("phone_calls")
    op.drop_table("phone_connections")
