"""Food tracking: the user's saved foods, and which food and how many servings a logged meal came from.

Adds one table and three nullable columns to meals; existing meals are untouched.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "foods",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("brand", sa.Text(), nullable=True),
        sa.Column("source", sa.Text(), server_default="custom", nullable=False),
        sa.Column("source_id", sa.Text(), nullable=True),
        sa.Column("barcode", sa.Text(), nullable=True),
        sa.Column("serving_label", sa.Text(), server_default="1 serving", nullable=False),
        sa.Column("serving_grams", sa.Numeric(), nullable=True),
        sa.Column("calories", sa.Numeric(), nullable=False),
        sa.Column("protein_g", sa.Numeric(), nullable=True),
        sa.Column("carbs_g", sa.Numeric(), nullable=True),
        sa.Column("fat_g", sa.Numeric(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("source in ('custom', 'off', 'usda', 'ai')", name=op.f("foods_source_check")),
        sa.CheckConstraint("calories >= 0", name=op.f("foods_calories_check")),
        sa.CheckConstraint("carbs_g is null or carbs_g >= 0", name=op.f("foods_carbs_g_check")),
        sa.CheckConstraint("char_length(name) <= 220", name=op.f("foods_name_length_check")),
        sa.CheckConstraint("char_length(serving_label) <= 80", name=op.f("foods_serving_label_length_check")),
        sa.CheckConstraint("fat_g is null or fat_g >= 0", name=op.f("foods_fat_g_check")),
        sa.CheckConstraint("protein_g is null or protein_g >= 0", name=op.f("foods_protein_g_check")),
        sa.CheckConstraint("serving_grams is null or serving_grams > 0", name=op.f("foods_serving_grams_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("foods_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("foods_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("foods_id_user_id_key")),
    )
    op.create_index("foods_user_barcode_idx", "foods", ["user_id", "barcode"], unique=False)
    op.create_index(
        "foods_user_source_idx", "foods", ["user_id", "source", "source_id"], unique=True, postgresql_where=sa.text("source_id is not null")
    )
    op.create_index("foods_user_used_idx", "foods", ["user_id", sa.literal_column("last_used_at desc nulls last")], unique=False)
    op.add_column("meals", sa.Column("food_id", sa.UUID(), nullable=True))
    op.add_column("meals", sa.Column("servings", sa.Numeric(), nullable=True))
    op.add_column("meals", sa.Column("meal_type", sa.Text(), nullable=True))
    op.create_index("meals_food_idx", "meals", ["food_id"], unique=False)
    op.create_check_constraint(op.f("meals_servings_check"), "meals", "servings is null or servings > 0")
    op.create_check_constraint(
        op.f("meals_meal_type_check"), "meals", "meal_type is null or meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'other')"
    )
    op.create_foreign_key(
        op.f("meals_food_id_user_id_fkey"), "meals", "foods", ["food_id", "user_id"], ["id", "user_id"], ondelete="SET NULL (food_id)"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("meals_food_id_user_id_fkey"), "meals", type_="foreignkey")
    op.drop_constraint(op.f("meals_meal_type_check"), "meals", type_="check")
    op.drop_constraint(op.f("meals_servings_check"), "meals", type_="check")
    op.drop_index("meals_food_idx", table_name="meals")
    op.drop_column("meals", "meal_type")
    op.drop_column("meals", "servings")
    op.drop_column("meals", "food_id")
    op.drop_index("foods_user_used_idx", table_name="foods")
    op.drop_index("foods_user_source_idx", table_name="foods", postgresql_where=sa.text("source_id is not null"))
    op.drop_index("foods_user_barcode_idx", table_name="foods")
    op.drop_table("foods")
