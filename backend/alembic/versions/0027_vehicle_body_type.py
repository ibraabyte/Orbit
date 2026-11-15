"""Car shape.

One new nullable column, vehicles.body_type: sedan, hatchback, coupe, suv, pickup or van. Existing cars start with none.

Downgrading drops the column and the chosen shapes with it.

Comes after 0026 (documents).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("vehicles", sa.Column("body_type", sa.Text(), nullable=True))
    op.create_check_constraint(
        op.f("vehicles_body_type_check"), "vehicles", "body_type in ('sedan', 'hatchback', 'coupe', 'suv', 'pickup', 'van')"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("vehicles_body_type_check"), "vehicles", type_="check")
    op.drop_column("vehicles", "body_type")
