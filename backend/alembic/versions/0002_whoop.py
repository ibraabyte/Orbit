"""WHOOP: the connection (encrypted OAuth tokens), the synced cycles, recoveries, sleeps and workouts, and AI summaries.

Only adds tables. Every row belongs to a user and goes with the account (on delete cascade).
Downgrading drops these tables, and with them any synced WHOOP data.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-29 09:51:07.093178
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "whoop_connections",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("whoop_user_id", sa.BigInteger(), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scope", sa.Text(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("whoop_connections_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("whoop_connections_pkey")),
    )
    op.create_table(
        "whoop_cycles",
        sa.Column("whoop_id", sa.BigInteger(), nullable=False),
        sa.Column("start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("timezone_offset", sa.Text(), nullable=True),
        sa.Column("strain", sa.Float(), nullable=True),
        sa.Column("kilojoule", sa.Float(), nullable=True),
        sa.Column("average_heart_rate", sa.Integer(), nullable=True),
        sa.Column("max_heart_rate", sa.Integer(), nullable=True),
        sa.Column("score_state", sa.Text(), nullable=False),
        sa.Column("whoop_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("whoop_cycles_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("whoop_cycles_pkey")),
        sa.UniqueConstraint("user_id", "whoop_id", name=op.f("whoop_cycles_user_id_whoop_id_key")),
    )
    op.create_index("whoop_cycles_user_start_idx", "whoop_cycles", ["user_id", sa.literal_column("start desc")], unique=False)
    op.create_table(
        "whoop_insights",
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("highlights", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("recommendations", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("whoop_insights_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("whoop_insights_pkey")),
    )
    op.create_index("whoop_insights_user_created_idx", "whoop_insights", ["user_id", sa.literal_column("created_at desc")], unique=False)
    op.create_table(
        "whoop_recoveries",
        sa.Column("cycle_id", sa.BigInteger(), nullable=False),
        sa.Column("sleep_id", sa.Text(), nullable=True),
        sa.Column("recovery_score", sa.Float(), nullable=True),
        sa.Column("resting_heart_rate", sa.Float(), nullable=True),
        sa.Column("hrv_rmssd_milli", sa.Float(), nullable=True),
        sa.Column("spo2_percentage", sa.Float(), nullable=True),
        sa.Column("skin_temp_celsius", sa.Float(), nullable=True),
        sa.Column("user_calibrating", sa.Boolean(), nullable=True),
        sa.Column("score_state", sa.Text(), nullable=False),
        sa.Column("whoop_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("whoop_recoveries_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("whoop_recoveries_pkey")),
        sa.UniqueConstraint("user_id", "cycle_id", name=op.f("whoop_recoveries_user_id_cycle_id_key")),
    )
    op.create_table(
        "whoop_sleeps",
        sa.Column("whoop_id", sa.Text(), nullable=False),
        sa.Column("start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone_offset", sa.Text(), nullable=True),
        sa.Column("nap", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("in_bed_milli", sa.Integer(), nullable=True),
        sa.Column("awake_milli", sa.Integer(), nullable=True),
        sa.Column("light_milli", sa.Integer(), nullable=True),
        sa.Column("slow_wave_milli", sa.Integer(), nullable=True),
        sa.Column("rem_milli", sa.Integer(), nullable=True),
        sa.Column("sleep_cycle_count", sa.Integer(), nullable=True),
        sa.Column("disturbance_count", sa.Integer(), nullable=True),
        sa.Column("sleep_need_milli", sa.Integer(), nullable=True),
        sa.Column("respiratory_rate", sa.Float(), nullable=True),
        sa.Column("performance_percentage", sa.Float(), nullable=True),
        sa.Column("consistency_percentage", sa.Float(), nullable=True),
        sa.Column("efficiency_percentage", sa.Float(), nullable=True),
        sa.Column("score_state", sa.Text(), nullable=False),
        sa.Column("whoop_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("whoop_sleeps_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("whoop_sleeps_pkey")),
        sa.UniqueConstraint("user_id", "whoop_id", name=op.f("whoop_sleeps_user_id_whoop_id_key")),
    )
    op.create_index("whoop_sleeps_user_start_idx", "whoop_sleeps", ["user_id", sa.literal_column("start desc")], unique=False)
    op.create_table(
        "whoop_workouts",
        sa.Column("whoop_id", sa.Text(), nullable=False),
        sa.Column("start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone_offset", sa.Text(), nullable=True),
        sa.Column("sport_name", sa.Text(), nullable=True),
        sa.Column("strain", sa.Float(), nullable=True),
        sa.Column("average_heart_rate", sa.Integer(), nullable=True),
        sa.Column("max_heart_rate", sa.Integer(), nullable=True),
        sa.Column("kilojoule", sa.Float(), nullable=True),
        sa.Column("distance_meter", sa.Float(), nullable=True),
        sa.Column("zone_durations", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("score_state", sa.Text(), nullable=False),
        sa.Column("whoop_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("whoop_workouts_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("whoop_workouts_pkey")),
        sa.UniqueConstraint("user_id", "whoop_id", name=op.f("whoop_workouts_user_id_whoop_id_key")),
    )
    op.create_index("whoop_workouts_user_start_idx", "whoop_workouts", ["user_id", sa.literal_column("start desc")], unique=False)


def downgrade() -> None:
    op.drop_index("whoop_workouts_user_start_idx", table_name="whoop_workouts")
    op.drop_table("whoop_workouts")
    op.drop_index("whoop_sleeps_user_start_idx", table_name="whoop_sleeps")
    op.drop_table("whoop_sleeps")
    op.drop_table("whoop_recoveries")
    op.drop_index("whoop_insights_user_created_idx", table_name="whoop_insights")
    op.drop_table("whoop_insights")
    op.drop_index("whoop_cycles_user_start_idx", table_name="whoop_cycles")
    op.drop_table("whoop_cycles")
    op.drop_table("whoop_connections")
