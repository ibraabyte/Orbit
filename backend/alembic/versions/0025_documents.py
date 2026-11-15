"""Official papers that expire.

One new table owned by a user: documents (the kind of paper, an optional name and whose it is, the day it expires and
the heads-ups before it). The number on the paper is not stored. Nothing existing is changed or removed.

Downgrading drops the table, so the papers saved in it are lost.

Comes after 0024 (Apple Health).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("holder", sa.Text(), nullable=True),
        sa.Column("expires_on", sa.Date(), nullable=False),
        sa.Column("remind_days", postgresql.ARRAY(sa.Integer()), server_default=sa.text("'{30,7,0}'::integer[]"), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "kind in ('national_id', 'iqama', 'passport', 'driving_license', 'health_insurance', 'visa', 'other')",
            name=op.f("documents_kind_check"),
        ),
        sa.CheckConstraint("char_length(name) between 1 and 80", name=op.f("documents_name_length_check")),
        sa.CheckConstraint("kind <> 'other' or name is not null", name=op.f("documents_other_named_check")),
        sa.CheckConstraint("char_length(holder) between 1 and 60", name=op.f("documents_holder_length_check")),
        sa.CheckConstraint("char_length(notes) <= 300", name=op.f("documents_notes_length_check")),
        sa.CheckConstraint("cardinality(remind_days) between 1 and 4", name=op.f("documents_remind_days_count_check")),
        sa.CheckConstraint("0 <= all(remind_days) and 365 >= all(remind_days)", name=op.f("documents_remind_days_range_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("documents_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("documents_pkey")),
    )
    op.create_index("documents_user_idx", "documents", ["user_id", "expires_on"], unique=False)


def downgrade() -> None:
    op.drop_index("documents_user_idx", table_name="documents")
    op.drop_table("documents")
