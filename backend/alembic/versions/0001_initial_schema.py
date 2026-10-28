"""Initial schema: users and refresh tokens, plus every table from supabase/migrations 0001-0016.

Ownership that Supabase enforced with RLS and owner-guard triggers is enforced here by the API
(every query filters by user_id) and by composite foreign keys on (id, user_id).

Revision ID: 0001
Revises:
Create Date: 2026-10-28 12:07:59.122442
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("users_pkey")),
    )
    op.create_index("users_lower_email_idx", "users", [sa.literal_column("lower(email)")], unique=True)
    op.create_table(
        "bills",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.Text(), server_default="USD", nullable=False),
        sa.Column("category", sa.Text(), server_default="subscriptions", nullable=False),
        sa.Column("due_at", sa.Date(), nullable=False),
        sa.Column("recurrence", sa.Text(), server_default="monthly", nullable=False),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        sa.Column("autopay", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "category in ('food', 'transport', 'fitness', 'home', 'subscriptions', 'shopping', 'health', 'travel', 'other')",
            name=op.f("bills_category_check"),
        ),
        sa.CheckConstraint("recurrence in ('once', 'weekly', 'monthly', 'yearly')", name=op.f("bills_recurrence_check")),
        sa.CheckConstraint("status in ('active', 'paid', 'paused')", name=op.f("bills_status_check")),
        sa.CheckConstraint("amount >= 0", name=op.f("bills_amount_check")),
        sa.CheckConstraint("char_length(currency) = 3", name=op.f("bills_currency_check")),
        sa.CheckConstraint("char_length(name) <= 220", name=op.f("bills_name_length_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("bills_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("bills_pkey")),
    )
    op.create_index("bills_user_due_idx", "bills", ["user_id", "status", "due_at"], unique=False)
    op.create_table(
        "captures",
        sa.Column("type", sa.Text(), server_default="link", nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("source", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("type in ('link', 'screenshot', 'note')", name=op.f("captures_type_check")),
        sa.CheckConstraint("char_length(title) <= 280", name=op.f("captures_title_length_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("captures_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("captures_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("captures_id_user_id_key")),
    )
    op.create_index("captures_user_created_idx", "captures", ["user_id", sa.literal_column("created_at desc")], unique=False)
    op.create_table(
        "expenses",
        sa.Column("merchant", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.Text(), server_default="USD", nullable=False),
        sa.Column("category", sa.Text(), server_default="other", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("spent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "category in ('food', 'transport', 'fitness', 'home', 'subscriptions', 'shopping', 'health', 'travel', 'other')",
            name=op.f("expenses_category_check"),
        ),
        sa.CheckConstraint("amount >= 0", name=op.f("expenses_amount_check")),
        sa.CheckConstraint("char_length(currency) = 3", name=op.f("expenses_currency_check")),
        sa.CheckConstraint("char_length(merchant) <= 220", name=op.f("expenses_merchant_length_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("expenses_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("expenses_pkey")),
    )
    op.create_index("expenses_user_category_idx", "expenses", ["user_id", "category", sa.literal_column("spent_at desc")], unique=False)
    op.create_index("expenses_user_spent_idx", "expenses", ["user_id", sa.literal_column("spent_at desc")], unique=False)
    op.create_table(
        "goals",
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        sa.Column("target_at", sa.Date(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status in ('active', 'completed', 'archived')", name=op.f("goals_status_check")),
        sa.CheckConstraint("char_length(title) <= 220", name=op.f("goals_title_length_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("goals_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("goals_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("goals_id_user_id_key")),
    )
    op.create_index("goals_user_status_idx", "goals", ["user_id", "status", sa.literal_column("updated_at desc")], unique=False)
    op.create_table(
        "habits",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("frequency", sa.Text(), server_default="daily", nullable=False),
        sa.Column("target_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("color", sa.Text(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("frequency in ('daily', 'weekly')", name=op.f("habits_frequency_check")),
        sa.CheckConstraint("char_length(name) <= 180", name=op.f("habits_name_length_check")),
        sa.CheckConstraint("target_count > 0 and target_count <= 21", name=op.f("habits_target_count_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("habits_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("habits_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("habits_id_user_id_key")),
    )
    op.create_index("habits_user_active_idx", "habits", ["user_id", "archived_at"], unique=False)
    op.create_table(
        "journal_entries",
        sa.Column("mood", sa.Text(), server_default="neutral", nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("mood in ('great', 'good', 'neutral', 'low', 'bad')", name=op.f("journal_entries_mood_check")),
        sa.CheckConstraint("char_length(title) <= 220", name=op.f("journal_entries_title_length_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("journal_entries_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("journal_entries_pkey")),
        sa.UniqueConstraint("user_id", "entry_date", name=op.f("journal_entries_user_id_entry_date_key")),
    )
    op.create_index("journal_entries_user_date_idx", "journal_entries", ["user_id", sa.literal_column("entry_date desc")], unique=False)
    op.create_table(
        "meal_plans",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("plan_date", sa.Date(), nullable=False),
        sa.Column("meal_type", sa.Text(), server_default="other", nullable=False),
        sa.Column("calories", sa.Integer(), server_default="0", nullable=False),
        sa.Column("protein_g", sa.Numeric(), nullable=True),
        sa.Column("carbs_g", sa.Numeric(), nullable=True),
        sa.Column("fat_g", sa.Numeric(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="planned", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'other')", name=op.f("meal_plans_meal_type_check")),
        sa.CheckConstraint("status in ('planned', 'prepped', 'eaten', 'skipped')", name=op.f("meal_plans_status_check")),
        sa.CheckConstraint("calories >= 0", name=op.f("meal_plans_calories_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("meal_plans_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("meal_plans_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("meal_plans_id_user_id_key")),
    )
    op.create_index("meal_plans_user_date_idx", "meal_plans", ["user_id", sa.literal_column("plan_date desc")], unique=False)
    op.create_index("meal_plans_user_status_idx", "meal_plans", ["user_id", "status", "plan_date"], unique=False)
    op.create_table(
        "meals",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("calories", sa.Integer(), nullable=False),
        sa.Column("protein_g", sa.Numeric(), nullable=True),
        sa.Column("carbs_g", sa.Numeric(), nullable=True),
        sa.Column("fat_g", sa.Numeric(), nullable=True),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("calories >= 0", name=op.f("meals_calories_check")),
        sa.CheckConstraint("char_length(name) <= 220", name=op.f("meals_name_length_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("meals_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("meals_pkey")),
    )
    op.create_index("meals_user_logged_idx", "meals", ["user_id", sa.literal_column("logged_at desc")], unique=False)
    op.create_table(
        "people",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("relationship", sa.Text(), nullable=True),
        sa.Column("contact_method", sa.Text(), nullable=True),
        sa.Column("birthday", sa.Date(), nullable=True),
        sa.Column("last_contacted_at", sa.Date(), nullable=True),
        sa.Column("next_follow_up_at", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("favorite", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("people_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("people_pkey")),
    )
    op.create_index("people_user_birthday_idx", "people", ["user_id", "birthday"], unique=False)
    op.create_index("people_user_favorite_idx", "people", ["user_id", "favorite"], unique=False)
    op.create_index("people_user_followup_idx", "people", ["user_id", "next_follow_up_at"], unique=False)
    op.create_index("people_user_name_idx", "people", ["user_id", "name"], unique=False)
    op.create_index("people_user_updated_idx", "people", ["user_id", sa.literal_column("updated_at desc")], unique=False)
    op.create_table(
        "profiles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("timezone", sa.Text(), server_default="UTC", nullable=False),
        sa.Column("weight_unit", sa.Text(), server_default="kg", nullable=False),
        sa.Column("daily_calorie_target", sa.Integer(), nullable=True),
        sa.Column("daily_protein_target", sa.Integer(), nullable=True),
        sa.Column("daily_carbs_target", sa.Integer(), nullable=True),
        sa.Column("daily_fat_target", sa.Integer(), nullable=True),
        sa.Column("weekly_workout_minutes_target", sa.Integer(), server_default="150", nullable=False),
        sa.Column(
            "dashboard_modules",
            postgresql.ARRAY(sa.Text()),
            server_default=sa.text(
                "array['attention', 'tasks', 'library', 'reminders', 'upcoming', 'health', 'review', 'insights', 'goals', 'food', 'finance', 'people', 'focus', 'habits', 'journal']::text[]"
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "cardinality(dashboard_modules) > 0 and dashboard_modules <@ array['attention', 'tasks', 'library', 'reminders', 'upcoming', 'health', 'review', 'insights', 'goals', 'food', 'finance', 'people', 'focus', 'habits', 'journal']::text[]",
            name=op.f("profiles_dashboard_modules_valid_check"),
        ),
        sa.CheckConstraint("weight_unit in ('kg', 'lb')", name=op.f("profiles_weight_unit_check")),
        sa.CheckConstraint(
            "daily_calorie_target is null or (daily_calorie_target >= 0 and daily_calorie_target <= 20000)",
            name=op.f("profiles_daily_calorie_target_check"),
        ),
        sa.CheckConstraint(
            "daily_carbs_target is null or (daily_carbs_target >= 0 and daily_carbs_target <= 2000)",
            name=op.f("profiles_daily_carbs_target_check"),
        ),
        sa.CheckConstraint(
            "daily_fat_target is null or (daily_fat_target >= 0 and daily_fat_target <= 1000)", name=op.f("profiles_daily_fat_target_check")
        ),
        sa.CheckConstraint(
            "daily_protein_target is null or (daily_protein_target >= 0 and daily_protein_target <= 1000)",
            name=op.f("profiles_daily_protein_target_check"),
        ),
        sa.CheckConstraint(
            "weekly_workout_minutes_target >= 0 and weekly_workout_minutes_target <= 10080",
            name=op.f("profiles_weekly_workout_minutes_target_check"),
        ),
        sa.ForeignKeyConstraint(["id"], ["users.id"], name=op.f("profiles_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("profiles_pkey")),
    )
    op.create_table(
        "push_subscriptions",
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("push_subscriptions_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("push_subscriptions_pkey")),
        sa.UniqueConstraint("user_id", "endpoint", name=op.f("push_subscriptions_user_id_endpoint_key")),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("family_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("device", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("refresh_tokens_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("refresh_tokens_pkey")),
        sa.UniqueConstraint("token_hash", name=op.f("refresh_tokens_token_hash_key")),
    )
    op.create_index(op.f("refresh_tokens_family_id_idx"), "refresh_tokens", ["family_id"], unique=False)
    op.create_index("refresh_tokens_user_idx", "refresh_tokens", ["user_id", "revoked_at"], unique=False)
    op.create_table(
        "sleep_logs",
        sa.Column("sleep_date", sa.Date(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("quality", sa.Integer(), nullable=True),
        sa.Column("bedtime_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("woke_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("duration_minutes >= 0 and duration_minutes <= 1440", name=op.f("sleep_logs_duration_minutes_check")),
        sa.CheckConstraint("quality is null or (quality >= 1 and quality <= 5)", name=op.f("sleep_logs_quality_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("sleep_logs_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("sleep_logs_pkey")),
    )
    op.create_index("sleep_logs_user_date_idx", "sleep_logs", ["user_id", sa.literal_column("sleep_date desc")], unique=False)
    op.create_table(
        "tags",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("color", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("tags_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("tags_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("tags_id_user_id_key")),
    )
    op.create_index("tags_user_lower_name_idx", "tags", ["user_id", sa.literal_column("lower(name)")], unique=True)
    op.create_table(
        "tasks",
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="open", nullable=False),
        sa.Column("priority", sa.Text(), server_default="normal", nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reminder_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recurrence", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("priority in ('low', 'normal', 'high')", name=op.f("tasks_priority_check")),
        sa.CheckConstraint("recurrence is null or recurrence in ('daily', 'weekly', 'monthly')", name=op.f("tasks_recurrence_check")),
        sa.CheckConstraint("status in ('open', 'done', 'archived')", name=op.f("tasks_status_check")),
        sa.CheckConstraint("char_length(title) <= 220", name=op.f("tasks_title_length_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("tasks_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("tasks_pkey")),
        sa.UniqueConstraint("id", "user_id", name=op.f("tasks_id_user_id_key")),
    )
    op.create_index(
        "tasks_due_reminders_idx",
        "tasks",
        ["status", "reminder_at"],
        unique=False,
        postgresql_where=sa.text("reminder_at is not null and reminder_sent_at is null"),
    )
    op.create_index("tasks_user_created_idx", "tasks", ["user_id", sa.literal_column("created_at desc")], unique=False)
    op.create_index("tasks_user_due_idx", "tasks", ["user_id", "due_at"], unique=False)
    op.create_table(
        "vehicles",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("plate", sa.Text(), nullable=True),
        sa.Column("odometer_km", sa.Integer(), nullable=True),
        sa.Column("registration_expires_at", sa.Date(), nullable=True),
        sa.Column("insurance_expires_at", sa.Date(), nullable=True),
        sa.Column("inspection_expires_at", sa.Date(), nullable=True),
        sa.Column("next_oil_change_at", sa.Date(), nullable=True),
        sa.Column("next_oil_change_km", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("char_length(name) <= 120", name=op.f("vehicles_name_length_check")),
        sa.CheckConstraint("char_length(plate) <= 20", name=op.f("vehicles_plate_length_check")),
        sa.CheckConstraint("next_oil_change_km >= 0", name=op.f("vehicles_next_oil_change_km_check")),
        sa.CheckConstraint("odometer_km >= 0", name=op.f("vehicles_odometer_km_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("vehicles_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("vehicles_pkey")),
    )
    op.create_index("vehicles_user_idx", "vehicles", ["user_id", "created_at"], unique=False)
    op.create_table(
        "watch_items",
        sa.Column("tmdb_id", sa.Integer(), nullable=False),
        sa.Column("media_type", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("poster_path", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="want", nullable=False),
        sa.Column("season", sa.Integer(), nullable=True),
        sa.Column("episode", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("media_type in ('movie', 'tv')", name=op.f("watch_items_media_type_check")),
        sa.CheckConstraint("status in ('want', 'watching', 'done')", name=op.f("watch_items_status_check")),
        sa.CheckConstraint("char_length(title) <= 300", name=op.f("watch_items_title_length_check")),
        sa.CheckConstraint("episode >= 0", name=op.f("watch_items_episode_check")),
        sa.CheckConstraint("season >= 0", name=op.f("watch_items_season_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("watch_items_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("watch_items_pkey")),
        sa.UniqueConstraint("user_id", "media_type", "tmdb_id", name=op.f("watch_items_user_id_media_type_tmdb_id_key")),
    )
    op.create_index("watch_items_user_status_idx", "watch_items", ["user_id", "status", sa.literal_column("updated_at desc")], unique=False)
    op.create_table(
        "weight_logs",
        sa.Column("weight", sa.Numeric(), nullable=False),
        sa.Column("unit", sa.Text(), server_default="kg", nullable=False),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("unit in ('kg', 'lb')", name=op.f("weight_logs_unit_check")),
        sa.CheckConstraint("weight > 0", name=op.f("weight_logs_weight_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("weight_logs_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("weight_logs_pkey")),
    )
    op.create_index("weight_logs_user_logged_idx", "weight_logs", ["user_id", sa.literal_column("logged_at desc")], unique=False)
    op.create_table(
        "workouts",
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("calories", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("calories >= 0", name=op.f("workouts_calories_check")),
        sa.CheckConstraint("char_length(type) <= 160", name=op.f("workouts_type_length_check")),
        sa.CheckConstraint("duration_minutes >= 0", name=op.f("workouts_duration_minutes_check")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("workouts_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("workouts_pkey")),
    )
    op.create_index("workouts_user_logged_idx", "workouts", ["user_id", sa.literal_column("logged_at desc")], unique=False)
    op.create_table(
        "attachments",
        sa.Column("capture_id", sa.UUID(), nullable=True),
        sa.Column("bucket", sa.Text(), nullable=False),
        sa.Column("object_path", sa.Text(), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("content_type", sa.Text(), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["capture_id", "user_id"],
            ["captures.id", "captures.user_id"],
            name=op.f("attachments_capture_id_user_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("attachments_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("attachments_pkey")),
    )
    op.create_index("attachments_user_created_idx", "attachments", ["user_id", sa.literal_column("created_at desc")], unique=False)
    op.create_table(
        "focus_sessions",
        sa.Column("task_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.Text(), server_default="completed", nullable=False),
        sa.Column("energy", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status in ('planned', 'completed', 'cancelled')", name=op.f("focus_sessions_status_check")),
        sa.CheckConstraint("char_length(title) <= 220", name=op.f("focus_sessions_title_length_check")),
        sa.CheckConstraint("duration_minutes >= 0 and duration_minutes <= 1440", name=op.f("focus_sessions_duration_minutes_check")),
        sa.CheckConstraint("energy is null or (energy >= 1 and energy <= 5)", name=op.f("focus_sessions_energy_check")),
        sa.ForeignKeyConstraint(
            ["task_id", "user_id"],
            ["tasks.id", "tasks.user_id"],
            name=op.f("focus_sessions_task_id_user_id_fkey"),
            ondelete="SET NULL (task_id)",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("focus_sessions_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("focus_sessions_pkey")),
    )
    op.create_index("focus_sessions_task_idx", "focus_sessions", ["task_id", sa.literal_column("started_at desc")], unique=False)
    op.create_index("focus_sessions_user_started_idx", "focus_sessions", ["user_id", sa.literal_column("started_at desc")], unique=False)
    op.create_index("focus_sessions_user_status_idx", "focus_sessions", ["user_id", "status", "started_at"], unique=False)
    op.create_table(
        "goal_milestones",
        sa.Column("goal_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("char_length(title) <= 220", name=op.f("goal_milestones_title_length_check")),
        sa.ForeignKeyConstraint(
            ["goal_id", "user_id"], ["goals.id", "goals.user_id"], name=op.f("goal_milestones_goal_id_user_id_fkey"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("goal_milestones_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("goal_milestones_pkey")),
    )
    op.create_index("goal_milestones_goal_idx", "goal_milestones", ["goal_id", "completed_at"], unique=False)
    op.create_index("goal_milestones_user_created_idx", "goal_milestones", ["user_id", sa.literal_column("created_at desc")], unique=False)
    op.create_table(
        "grocery_items",
        sa.Column("meal_plan_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Text(), nullable=True),
        sa.Column("category", sa.Text(), server_default="other", nullable=False),
        sa.Column("status", sa.Text(), server_default="needed", nullable=False),
        sa.Column("due_at", sa.Date(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "category in ('produce', 'protein', 'dairy', 'pantry', 'frozen', 'household', 'other')",
            name=op.f("grocery_items_category_check"),
        ),
        sa.CheckConstraint("status in ('needed', 'bought', 'skipped')", name=op.f("grocery_items_status_check")),
        sa.ForeignKeyConstraint(
            ["meal_plan_id", "user_id"],
            ["meal_plans.id", "meal_plans.user_id"],
            name=op.f("grocery_items_meal_plan_id_user_id_fkey"),
            ondelete="SET NULL (meal_plan_id)",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("grocery_items_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("grocery_items_pkey")),
    )
    op.create_index("grocery_items_meal_plan_idx", "grocery_items", ["meal_plan_id"], unique=False)
    op.create_index("grocery_items_user_created_idx", "grocery_items", ["user_id", sa.literal_column("created_at desc")], unique=False)
    op.create_index(
        "grocery_items_user_status_idx", "grocery_items", ["user_id", "status", sa.literal_column("created_at desc")], unique=False
    )
    op.create_table(
        "habit_logs",
        sa.Column("habit_id", sa.UUID(), nullable=False),
        sa.Column("logged_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["habit_id", "user_id"], ["habits.id", "habits.user_id"], name=op.f("habit_logs_habit_id_user_id_fkey"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("habit_logs_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("habit_logs_pkey")),
    )
    op.create_index("habit_logs_habit_logged_idx", "habit_logs", ["habit_id", sa.literal_column("logged_at desc")], unique=False)
    op.create_index("habit_logs_user_logged_idx", "habit_logs", ["user_id", sa.literal_column("logged_at desc")], unique=False)
    op.create_table(
        "reminders",
        sa.Column("task_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("remind_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.Text(), server_default="scheduled", nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status in ('scheduled', 'sent', 'cancelled')", name=op.f("reminders_status_check")),
        sa.CheckConstraint("char_length(title) <= 220", name=op.f("reminders_title_length_check")),
        sa.ForeignKeyConstraint(
            ["task_id", "user_id"], ["tasks.id", "tasks.user_id"], name=op.f("reminders_task_id_user_id_fkey"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("reminders_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("reminders_pkey")),
    )
    op.create_index("reminders_due_idx", "reminders", ["status", "remind_at"], unique=False)
    op.create_index("reminders_user_remind_idx", "reminders", ["user_id", "remind_at"], unique=False)
    op.create_table(
        "taggings",
        sa.Column("tag_id", sa.UUID(), nullable=False),
        sa.Column("target_type", sa.Text(), nullable=False),
        sa.Column("target_id", sa.UUID(), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "target_type in ('task', 'capture', 'meal', 'workout', 'expense', 'bill', 'sleep', 'focus_session', 'meal_plan', 'grocery_item')",
            name=op.f("taggings_target_type_check"),
        ),
        sa.ForeignKeyConstraint(
            ["tag_id", "user_id"], ["tags.id", "tags.user_id"], name=op.f("taggings_tag_id_user_id_fkey"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("taggings_user_id_fkey"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("taggings_pkey")),
        sa.UniqueConstraint(
            "user_id", "tag_id", "target_type", "target_id", name=op.f("taggings_user_id_tag_id_target_type_target_id_key")
        ),
    )
    op.create_index("taggings_target_idx", "taggings", ["user_id", "target_type", "target_id"], unique=False)
    op.create_index("taggings_user_created_idx", "taggings", ["user_id", sa.literal_column("created_at desc")], unique=False)


def downgrade() -> None:
    op.drop_index("taggings_user_created_idx", table_name="taggings")
    op.drop_index("taggings_target_idx", table_name="taggings")
    op.drop_table("taggings")
    op.drop_index("reminders_user_remind_idx", table_name="reminders")
    op.drop_index("reminders_due_idx", table_name="reminders")
    op.drop_table("reminders")
    op.drop_index("habit_logs_user_logged_idx", table_name="habit_logs")
    op.drop_index("habit_logs_habit_logged_idx", table_name="habit_logs")
    op.drop_table("habit_logs")
    op.drop_index("grocery_items_user_status_idx", table_name="grocery_items")
    op.drop_index("grocery_items_user_created_idx", table_name="grocery_items")
    op.drop_index("grocery_items_meal_plan_idx", table_name="grocery_items")
    op.drop_table("grocery_items")
    op.drop_index("goal_milestones_user_created_idx", table_name="goal_milestones")
    op.drop_index("goal_milestones_goal_idx", table_name="goal_milestones")
    op.drop_table("goal_milestones")
    op.drop_index("focus_sessions_user_status_idx", table_name="focus_sessions")
    op.drop_index("focus_sessions_user_started_idx", table_name="focus_sessions")
    op.drop_index("focus_sessions_task_idx", table_name="focus_sessions")
    op.drop_table("focus_sessions")
    op.drop_index("attachments_user_created_idx", table_name="attachments")
    op.drop_table("attachments")
    op.drop_index("workouts_user_logged_idx", table_name="workouts")
    op.drop_table("workouts")
    op.drop_index("weight_logs_user_logged_idx", table_name="weight_logs")
    op.drop_table("weight_logs")
    op.drop_index("watch_items_user_status_idx", table_name="watch_items")
    op.drop_table("watch_items")
    op.drop_index("vehicles_user_idx", table_name="vehicles")
    op.drop_table("vehicles")
    op.drop_index("tasks_user_due_idx", table_name="tasks")
    op.drop_index("tasks_user_created_idx", table_name="tasks")
    op.drop_index(
        "tasks_due_reminders_idx", table_name="tasks", postgresql_where=sa.text("reminder_at is not null and reminder_sent_at is null")
    )
    op.drop_table("tasks")
    op.drop_index("tags_user_lower_name_idx", table_name="tags")
    op.drop_table("tags")
    op.drop_index("sleep_logs_user_date_idx", table_name="sleep_logs")
    op.drop_table("sleep_logs")
    op.drop_index("refresh_tokens_user_idx", table_name="refresh_tokens")
    op.drop_index(op.f("refresh_tokens_family_id_idx"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("push_subscriptions")
    op.drop_table("profiles")
    op.drop_index("people_user_updated_idx", table_name="people")
    op.drop_index("people_user_name_idx", table_name="people")
    op.drop_index("people_user_followup_idx", table_name="people")
    op.drop_index("people_user_favorite_idx", table_name="people")
    op.drop_index("people_user_birthday_idx", table_name="people")
    op.drop_table("people")
    op.drop_index("meals_user_logged_idx", table_name="meals")
    op.drop_table("meals")
    op.drop_index("meal_plans_user_status_idx", table_name="meal_plans")
    op.drop_index("meal_plans_user_date_idx", table_name="meal_plans")
    op.drop_table("meal_plans")
    op.drop_index("journal_entries_user_date_idx", table_name="journal_entries")
    op.drop_table("journal_entries")
    op.drop_index("habits_user_active_idx", table_name="habits")
    op.drop_table("habits")
    op.drop_index("goals_user_status_idx", table_name="goals")
    op.drop_table("goals")
    op.drop_index("expenses_user_spent_idx", table_name="expenses")
    op.drop_index("expenses_user_category_idx", table_name="expenses")
    op.drop_table("expenses")
    op.drop_index("captures_user_created_idx", table_name="captures")
    op.drop_table("captures")
    op.drop_index("bills_user_due_idx", table_name="bills")
    op.drop_table("bills")
    op.drop_index("users_lower_email_idx", table_name="users")
    op.drop_table("users")
