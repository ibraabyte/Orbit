"""Leave-time alerts: a place on a task, and the user's own Google Maps key.

Two new columns on tasks, both empty for every existing task:
- place_name: where the appointment is, as the user typed it or picked it (1 to 160 characters).
- place_id: the Google place it was picked from, if any (Google allows keeping a place id; no coordinates are kept).
A place id always comes with a name.

One existing check is widened: service_connections.provider also allows 'google_maps' (the user's Google Maps
Platform key, encrypted). No existing row or column is changed or removed.

Downgrading drops the two columns (the places typed on tasks are lost) and removes linked Google Maps keys before
narrowing the check back to Seerr and 17TRACK.

Comes after 0028 (order tracker).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("place_name", sa.Text(), nullable=True))
    op.add_column("tasks", sa.Column("place_id", sa.Text(), nullable=True))
    op.create_check_constraint(op.f("tasks_place_name_length_check"), "tasks", "char_length(place_name) between 1 and 160")
    op.create_check_constraint(op.f("tasks_place_id_length_check"), "tasks", "char_length(place_id) between 1 and 300")
    op.create_check_constraint(op.f("tasks_place_named_check"), "tasks", "place_id is null or place_name is not null")
    op.drop_constraint(op.f("service_connections_provider_check"), "service_connections", type_="check")
    op.create_check_constraint(
        op.f("service_connections_provider_check"), "service_connections", "provider in ('seerr', '17track', 'google_maps')"
    )


def downgrade() -> None:
    op.execute("delete from service_connections where provider = 'google_maps'")
    op.drop_constraint(op.f("service_connections_provider_check"), "service_connections", type_="check")
    op.create_check_constraint(op.f("service_connections_provider_check"), "service_connections", "provider in ('seerr', '17track')")
    op.drop_constraint(op.f("tasks_place_named_check"), "tasks", type_="check")
    op.drop_constraint(op.f("tasks_place_id_length_check"), "tasks", type_="check")
    op.drop_constraint(op.f("tasks_place_name_length_check"), "tasks", type_="check")
    op.drop_column("tasks", "place_id")
    op.drop_column("tasks", "place_name")
