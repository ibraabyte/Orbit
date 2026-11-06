"""The saver: a saved link keeps its category, whether it's still to see or already seen, a thumbnail, the site's name and a
short summary. Every existing capture stays as it is and lands in "other", still to see.

Downgrading drops the five new columns (and what was in them); the captures themselves stay.

Comes after 0012 (more than one AI).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("captures", sa.Column("category", sa.Text(), server_default="other", nullable=False))
    op.add_column("captures", sa.Column("status", sa.Text(), server_default="want", nullable=False))
    op.add_column("captures", sa.Column("image_url", sa.Text(), nullable=True))
    op.add_column("captures", sa.Column("site_name", sa.Text(), nullable=True))
    op.add_column("captures", sa.Column("summary", sa.Text(), nullable=True))
    op.create_check_constraint(op.f("captures_category_check"), "captures", "char_length(category) between 1 and 40")
    op.create_check_constraint(op.f("captures_status_check"), "captures", "status in ('want', 'done')")
    op.create_check_constraint(op.f("captures_summary_length_check"), "captures", "char_length(summary) <= 1000")
    op.create_index("captures_user_category_idx", "captures", ["user_id", "category"])


def downgrade() -> None:
    op.drop_index("captures_user_category_idx", table_name="captures")
    op.drop_constraint(op.f("captures_summary_length_check"), "captures", type_="check")
    op.drop_constraint(op.f("captures_status_check"), "captures", type_="check")
    op.drop_constraint(op.f("captures_category_check"), "captures", type_="check")
    for column in ("summary", "site_name", "image_url", "status", "category"):
        op.drop_column("captures", column)
