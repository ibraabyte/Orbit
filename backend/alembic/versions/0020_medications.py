"""Medications and their doses.

New tables, both owned by a user: medications (name, dose, when to take it, an optional course end, the stock left)
and medication_doses (one row per dose answered: taken or skipped, for the moment it was due). Nothing existing is
changed or removed.

Downgrading drops the two tables, so the medicines and their log are lost.

Comes after 0019 (voice connections).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "medications",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("dose", sa.Text(), nullable=True),
        sa.Column("schedule", sa.Text(), server_default="daily", nullable=False),
        sa.Column("times", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("weekdays", postgresql.ARRAY(sa.Integer()), server_default=sa.text("'{}'::integer[]"), nullable=False),
        sa.Column("every_hours", sa.Integer(), nullable=True),
        sa.Column("starts_on", sa.Date(), server_default=sa.text("CURRENT_DATE"), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=True),
        sa.Column("paused", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("stock", sa.Numeric(), nullable=True),
        sa.Column("per_dose", sa.Numeric(), server_default="1", nullable=False),
        sa.Column("low_stock_at", sa.Numeric(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "(schedule = 'interval') = (every_hours is not null) and (every_hours is null or every_hours in (2, 3, 4, 6, 8, 12))",
            name=op.f("medications_every_hours_check"),
        ),
        sa.CheckConstraint("schedule <> 'weekdays' or cardinality(weekdays) >= 1", name=op.f("medications_weekdays_set_check")),
        sa.CheckConstraint("schedule in ('daily', 'weekdays', 'interval')", name=op.f("medications_schedule_check")),
        sa.CheckConstraint("cardinality(times) between 1 and 12", name=op.f("medications_times_check")),
        sa.CheckConstraint("char_length(dose) <= 60", name=op.f("medications_dose_length_check")),
        sa.CheckConstraint("char_length(name) between 1 and 120", name=op.f("medications_name_length_check")),
        sa.CheckConstraint("char_length(notes) <= 500", name=op.f("medications_notes_length_check")),
        sa.CheckConstraint("ends_on is null or ends_on >= starts_on", name=op.f("medications_course_check")),
        sa.CheckConstraint(
            "low_stock_at is null or (low_stock_at >= 0 and low_stock_at < 100000)", name=op.f("medications_low_stock_at_check")
        ),
        sa.CheckConstraint("per_dose > 0 and per_dose <= 100", name=op.f("medications_per_dose_check")),
        sa.CheckConstraint("stock is null or (stock >= 0 and stock < 100000)", name=op.f("medications_stock_check")),
        sa.CheckConstraint("weekdays <@ array[0, 1, 2, 3, 4, 5, 6]", name=op.f("medications_weekdays_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("medications_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("medications_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("medications_id_user_id_key")),
    )
    op.create_index("medications_user_idx", "medications", ["user_id", "created_at"], unique=False)
    op.create_table(
        "medication_doses",
        sa.Column("medication_id", sa.UUID(), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("taken_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status in ('taken', 'skipped')", name=op.f("medication_doses_status_check")),
        sa.ForeignKeyConstraint(
            ["medication_id", "user_id"],
            ["medications.id", "medications.user_id"],
            name=op.f("medication_doses_medication_id_user_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("medication_doses_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("medication_doses_pkey")),
        sa.UniqueConstraint("medication_id", "scheduled_at", name=op.f("medication_doses_medication_id_scheduled_at_key")),
    )
    op.create_index("medication_doses_user_idx", "medication_doses", ["user_id", sa.literal_column("scheduled_at desc")], unique=False)


def downgrade() -> None:
    op.drop_index("medication_doses_user_idx", table_name="medication_doses")
    op.drop_table("medication_doses")
    op.drop_index("medications_user_idx", table_name="medications")
    op.drop_table("medications")
