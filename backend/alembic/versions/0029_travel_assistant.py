"""Travel assistant: a SerpApi key per user.

One existing check is widened: service_connections.provider also allows 'serpapi' (the user's own SerpApi key for
flight and hotel prices, encrypted). No table is added; a trip becomes an ordinary task list. No existing row or
column is changed or removed.

Downgrading removes linked SerpApi keys before narrowing the check back to Seerr and 17TRACK.

Comes after 0028 (order tracker).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(op.f("service_connections_provider_check"), "service_connections", type_="check")
    op.create_check_constraint(op.f("service_connections_provider_check"), "service_connections", "provider in ('seerr', '17track', 'serpapi')")


def downgrade() -> None:
    op.execute("delete from service_connections where provider = 'serpapi'")
    op.drop_constraint(op.f("service_connections_provider_check"), "service_connections", type_="check")
    op.create_check_constraint(op.f("service_connections_provider_check"), "service_connections", "provider in ('seerr', '17track')")
