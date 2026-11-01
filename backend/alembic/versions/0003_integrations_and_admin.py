"""Per-user integrations and an admin: service_connections (Seerr URL + encrypted key per user), server_settings
(the sign-up switch the admin flips in the app) and users.is_admin.

Only adds tables and one column; no row is deleted or changed except marking the oldest account as admin
(the person who set up the server). Downgrading drops these, and with them any saved Seerr keys.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-01 00:18:11.367624
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "server_settings",
        sa.Column("id", sa.Integer(), server_default="1", autoincrement=False, nullable=False),
        sa.Column("signups_open", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("id = 1", name=op.f("server_settings_single_row_check")),
        sa.PrimaryKeyConstraint("id", name=op.f("server_settings_pkey")),
    )
    op.create_table(
        "service_connections",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("api_key", sa.Text(), nullable=False),
        sa.Column("account_name", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("provider in ('seerr')", name=op.f("service_connections_provider_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("service_connections_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "provider", name=op.f("service_connections_pkey")),
    )
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), server_default="false", nullable=False))
    # Whoever signed up first set up this server; they become its admin.
    op.execute("update users set is_admin = true where id = (select id from users order by created_at, id limit 1)")


def downgrade() -> None:
    op.drop_column("users", "is_admin")
    op.drop_table("service_connections")
    op.drop_table("server_settings")
