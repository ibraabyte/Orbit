"""The smart saver: every saved item keeps what the AI saw in it, editable tags, and words to find it by.

New columns on captures (all empty or default for what is already saved): labels (tags), analysis (what is in the video or
picture), search_terms (words and synonyms in Arabic and English), content_text (a tweet's text or a video's caption),
author, analysis_status, analysis_error and media_error. Captures may now also be a shared picture ('image') or video
('video'). The copies of videos and pictures are files on the server's disk, listed in the existing attachments table
(bucket 'saver'); this adds an index there so a capture's files are found quickly.

Nothing existing is changed or removed. Downgrading drops the new columns and the index (and what is in them), and turns
any 'image' or 'video' capture back into a 'note' so the old type rule holds again; the files on disk stay.

Comes after 0022 (what each AI feature uses).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = ("media_error", "analysis_error", "analysis_status", "author", "content_text", "search_terms", "analysis", "labels")
CHECKS = {
    "captures_analysis_status_check": "analysis_status in ('none', 'pending', 'done', 'failed', 'no_ai')",
    "captures_analysis_length_check": "char_length(analysis) <= 4000",
    "captures_content_text_length_check": "char_length(content_text) <= 8000",
    "captures_labels_count_check": "cardinality(labels) <= 20",
}


def upgrade() -> None:
    op.add_column("captures", sa.Column("labels", postgresql.ARRAY(sa.Text()), server_default="{}", nullable=False))
    op.add_column("captures", sa.Column("analysis", sa.Text(), nullable=True))
    op.add_column("captures", sa.Column("search_terms", sa.Text(), nullable=True))
    op.add_column("captures", sa.Column("content_text", sa.Text(), nullable=True))
    op.add_column("captures", sa.Column("author", sa.Text(), nullable=True))
    op.add_column("captures", sa.Column("analysis_status", sa.Text(), server_default="none", nullable=False))
    op.add_column("captures", sa.Column("analysis_error", sa.Text(), nullable=True))
    op.add_column("captures", sa.Column("media_error", sa.Text(), nullable=True))
    for name, condition in CHECKS.items():
        op.create_check_constraint(op.f(name), "captures", condition)
    op.drop_constraint(op.f("captures_type_check"), "captures", type_="check")
    op.create_check_constraint(op.f("captures_type_check"), "captures", "type in ('link', 'screenshot', 'note', 'image', 'video')")
    op.create_index("attachments_capture_idx", "attachments", ["capture_id"])


def downgrade() -> None:
    op.drop_index("attachments_capture_idx", table_name="attachments")
    op.execute("update captures set type = 'note' where type in ('image', 'video')")
    op.drop_constraint(op.f("captures_type_check"), "captures", type_="check")
    op.create_check_constraint(op.f("captures_type_check"), "captures", "type in ('link', 'screenshot', 'note')")
    for name in CHECKS:
        op.drop_constraint(op.f(name), "captures", type_="check")
    for column in COLUMNS:
        op.drop_column("captures", column)
