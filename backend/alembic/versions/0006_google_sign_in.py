"""Sign in with Google: users.google_sub, Google's permanent id for the person.

Only adds an empty column; no row is changed. Downgrading drops the links, and accounts made with Google
then have no way in until their password is reset.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-02 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("google_sub", sa.Text(), nullable=True))
    op.create_index("users_google_sub_idx", "users", ["google_sub"], unique=True)


def downgrade() -> None:
    op.drop_index("users_google_sub_idx", table_name="users")
    op.drop_column("users", "google_sub")
