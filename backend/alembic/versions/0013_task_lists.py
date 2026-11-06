"""Task lists and checklists: task_lists (Home, Work, ...), an optional list_id on each task, and task_steps (a
task's subtasks). All new and owned by a user; no existing row is changed or removed. Deleting a list later keeps its
tasks and only clears their list_id.

Downgrading drops the two new tables and tasks.list_id, so lists and checklists made since are lost; the tasks stay.

Comes after 0012 (many AIs).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "task_lists",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("char_length(name) between 1 and 60", name=op.f("task_lists_name_length_check")),
        sa.CheckConstraint("position >= 0", name=op.f("task_lists_position_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("task_lists_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("task_lists_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("task_lists_id_user_id_key")),
    )
    op.create_index("task_lists_user_lower_name_idx", "task_lists", ["user_id", sa.literal_column("lower(name)")], unique=True)
    op.create_index("task_lists_user_position_idx", "task_lists", ["user_id", "position"], unique=False)
    op.create_table(
        "task_steps",
        sa.Column("task_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("done", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("char_length(title) between 1 and 220", name=op.f("task_steps_title_length_check")),
        sa.CheckConstraint("position >= 0", name=op.f("task_steps_position_check")),
        sa.ForeignKeyConstraint(
            ["task_id", "user_id"], ["tasks.id", "tasks.user_id"], name=op.f("task_steps_task_id_user_id_fkey"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("task_steps_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("task_steps_pkey")),
    )
    op.create_index("task_steps_task_idx", "task_steps", ["task_id", "position"], unique=False)
    op.create_index("task_steps_user_idx", "task_steps", ["user_id"], unique=False)
    op.add_column("tasks", sa.Column("list_id", sa.UUID(), nullable=True))
    op.create_index("tasks_list_idx", "tasks", ["list_id"], unique=False)
    op.create_foreign_key(
        op.f("tasks_list_id_user_id_fkey"), "tasks", "task_lists", ["list_id", "user_id"], ["id", "user_id"], ondelete="SET NULL (list_id)"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("tasks_list_id_user_id_fkey"), "tasks", type_="foreignkey")
    op.drop_index("tasks_list_idx", table_name="tasks")
    op.drop_column("tasks", "list_id")
    op.drop_index("task_steps_user_idx", table_name="task_steps")
    op.drop_index("task_steps_task_idx", table_name="task_steps")
    op.drop_table("task_steps")
    op.drop_index("task_lists_user_position_idx", table_name="task_lists")
    op.drop_index("task_lists_user_lower_name_idx", table_name="task_lists")
    op.drop_table("task_lists")
