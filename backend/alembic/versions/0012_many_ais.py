"""More than one AI per user: ai_connections is keyed by (user_id, provider), and profiles.ai_default says which one is
used when the app doesn't pick. Every saved key stays as it is; ai_default starts empty, which means "the first one
connected", exactly what Orbit does today.

Downgrading goes back to one AI per user: it keeps each user's default (or oldest) key and deletes their other saved
keys, because the old table can hold only one.

Comes after 0011 (finance expansion).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ai_connections_pkey", "ai_connections", type_="primary")
    op.create_primary_key("ai_connections_pkey", "ai_connections", ["user_id", "provider"])
    op.add_column("profiles", sa.Column("ai_default", sa.Text(), nullable=True))
    op.create_check_constraint(
        op.f("profiles_ai_default_check"),
        "profiles",
        "ai_default is null or ai_default in ('chatgpt', 'anthropic', 'openai', 'gemini', 'openrouter')",
    )


def downgrade() -> None:
    # One row per user again: the default if it is an API key, otherwise the oldest.
    op.execute(
        """
        delete from ai_connections c
        using (
            select a.user_id, a.provider,
                   row_number() over (
                       partition by a.user_id
                       order by (a.provider = p.ai_default) desc nulls last, a.created_at, a.provider
                   ) as place
            from ai_connections a
            left join profiles p on p.id = a.user_id
        ) ranked
        where ranked.user_id = c.user_id and ranked.provider = c.provider and ranked.place > 1
        """
    )
    op.drop_constraint(op.f("profiles_ai_default_check"), "profiles", type_="check")
    op.drop_column("profiles", "ai_default")
    op.drop_constraint("ai_connections_pkey", "ai_connections", type_="primary")
    op.create_primary_key("ai_connections_pkey", "ai_connections", ["user_id"])
