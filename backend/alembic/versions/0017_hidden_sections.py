"""Sections the user can switch off.

Adds profiles.hidden_sections, a list of section names (food, finance, ...) the user switched off in Settings. It starts
empty for every existing profile, so nothing changes until the user switches something off. No row is changed or
removed, and a hidden section's own data is never touched.

Downgrading drops the column, so the choice of hidden sections is lost and every section shows again.

Comes after 0016 (workout logging).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column("hidden_sections", postgresql.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("profiles", "hidden_sections")
