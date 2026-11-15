"""Push notifications to the phone.

New table push_devices: one row per phone (its Expo push token), with the account it belongs to and the phone's
language. Seerr's webhook (POST /integrations/seerr/webhook/...) sends its news to these phones.

Downgrading drops the table; phones register again the next time Movies & TV opens.

Comes after 0030 (leave-time alerts).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "push_devices",
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("language", sa.Text(), server_default="en", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("language in ('ar', 'en')", name=op.f("push_devices_language_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("push_devices_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("token", name=op.f("push_devices_pkey")),
    )
    op.create_index(op.f("push_devices_user_id_idx"), "push_devices", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("push_devices_user_id_idx"), table_name="push_devices")
    op.drop_table("push_devices")
