"""The saver: what is said in a saved video, and the place or recipe in it.

Three new columns on captures, all filled in the background (services/saver_jobs.py):
- transcript: what is said in its video (at most 8000 characters), from the user's own voice model.
- place: the one place it is about, ready for a map search (at most 200 characters).
- ingredients: a recipe's ingredients (at most 40), empty when it isn't one.
Items saved before this start with none; "Look at it again" fills them.

Downgrading drops the columns and what is in them.

Comes after 0032 (bank SMS templates).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0033"
down_revision: str | None = "0032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("captures", sa.Column("transcript", sa.Text(), nullable=True))
    op.create_check_constraint(op.f("captures_transcript_length_check"), "captures", "char_length(transcript) <= 8000")
    op.add_column("captures", sa.Column("place", sa.Text(), nullable=True))
    op.create_check_constraint(op.f("captures_place_length_check"), "captures", "char_length(place) <= 200")
    op.add_column("captures", sa.Column("ingredients", postgresql.ARRAY(sa.Text()), server_default="{}", nullable=False))
    op.create_check_constraint(op.f("captures_ingredients_count_check"), "captures", "cardinality(ingredients) <= 40")


def downgrade() -> None:
    op.drop_constraint(op.f("captures_ingredients_count_check"), "captures", type_="check")
    op.drop_column("captures", "ingredients")
    op.drop_constraint(op.f("captures_place_length_check"), "captures", type_="check")
    op.drop_column("captures", "place")
    op.drop_constraint(op.f("captures_transcript_length_check"), "captures", type_="check")
    op.drop_column("captures", "transcript")
