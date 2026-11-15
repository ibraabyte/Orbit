"""Order tracker: shipments followed through the user's own 17TRACK account.

Two new tables owned by a user:
- shipments: one per tracking number (typed in, or found in a shipping email), its latest status, events and
  expected day, and the last alert the app showed.
- shipment_scans: when Orbit last looked through Gmail for shipping emails and last asked 17TRACK.

One existing check is widened: service_connections.provider also allows '17track' (the user's 17TRACK key, encrypted).
No existing row or column is changed or removed.

Downgrading drops the two tables (the followed shipments are lost) and removes linked 17TRACK keys before narrowing
the check back to Seerr only.

Comes after 0026 (documents).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shipment_scans",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("emails_read", sa.Integer(), server_default="0", nullable=False),
        sa.Column("email_error", sa.Text(), nullable=True),
        sa.Column("refreshed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tracking_error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("shipment_scans_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name=op.f("shipment_scans_pkey")),
    )
    op.create_table(
        "shipments",
        sa.Column("number", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column("store", sa.Text(), nullable=True),
        sa.Column("source", sa.Text(), server_default="manual", nullable=False),
        sa.Column("email_id", sa.Text(), nullable=True),
        sa.Column("carrier_code", sa.Integer(), nullable=True),
        sa.Column("carrier_name", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("sub_status", sa.Text(), nullable=True),
        sa.Column("last_event", sa.Text(), nullable=True),
        sa.Column("last_location", sa.Text(), nullable=True),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("eta_on", sa.Date(), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("events", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("registered", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("archived", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("alert_seen", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("source in ('manual', 'email')", name=op.f("shipments_source_check")),
        sa.CheckConstraint(
            "status in ('pending', 'not_found', 'info_received', 'in_transit', 'out_for_delivery', 'pickup', 'delivered', 'failed', 'exception', 'expired')",
            name=op.f("shipments_status_check"),
        ),
        sa.CheckConstraint("char_length(label) <= 80", name=op.f("shipments_label_length_check")),
        sa.CheckConstraint("char_length(number) between 5 and 40", name=op.f("shipments_number_length_check")),
        sa.CheckConstraint("char_length(store) <= 80", name=op.f("shipments_store_length_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("shipments_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("shipments_pkey")),
        sa.UniqueConstraint("user_id", "number", name=op.f("shipments_user_id_number_key")),
    )
    op.create_index("shipments_user_archived_idx", "shipments", ["user_id", "archived"], unique=False)
    op.drop_constraint(op.f("service_connections_provider_check"), "service_connections", type_="check")
    op.create_check_constraint(op.f("service_connections_provider_check"), "service_connections", "provider in ('seerr', '17track')")


def downgrade() -> None:
    op.execute("delete from service_connections where provider = '17track'")
    op.drop_constraint(op.f("service_connections_provider_check"), "service_connections", type_="check")
    op.create_check_constraint(op.f("service_connections_provider_check"), "service_connections", "provider in ('seerr')")
    op.drop_index("shipments_user_archived_idx", table_name="shipments")
    op.drop_table("shipments")
    op.drop_table("shipment_scans")
