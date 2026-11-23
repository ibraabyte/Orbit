"""Calls: the user's own script, and calling back after a dropped line.

Two new nullable columns on phone_calls, nothing removed:
- scenario: the user's own script for the agent (at most 2000 characters), on top of the plan.
- earlier_transcript: on a redial, what was said on the call before it dropped, so the agent carries on from there.
Existing calls get neither.

Downgrading drops the columns and what is in them.

Comes after 0033 (saver transcript).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0034"
down_revision: str | None = "0033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("phone_calls", sa.Column("scenario", sa.Text(), nullable=True))
    op.create_check_constraint(op.f("phone_calls_scenario_length_check"), "phone_calls", "char_length(scenario) <= 2000")
    op.add_column("phone_calls", sa.Column("earlier_transcript", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("phone_calls", "earlier_transcript")
    op.drop_constraint(op.f("phone_calls_scenario_length_check"), "phone_calls", type_="check")
    op.drop_column("phone_calls", "scenario")
