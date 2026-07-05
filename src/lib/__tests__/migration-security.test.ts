import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsPath = join(process.cwd(), "supabase", "migrations");
const migrationText = readdirSync(migrationsPath)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8"))
  .join("\n");

const ownerScopedTables = [
  "tasks",
  "reminders",
  "captures",
  "attachments",
  "tags",
  "taggings",
  "meals",
  "meal_plans",
  "grocery_items",
  "people",
  "weight_logs",
  "workouts",
  "sleep_logs",
  "focus_sessions",
  "expenses",
  "bills",
  "push_subscriptions",
  "habits",
  "habit_logs",
  "goals",
  "goal_milestones",
  "journal_entries"
];

const dashboardOwnerIndexes = [
  "tasks_user_created_idx on public.tasks(user_id, created_at desc)",
  "reminders_user_remind_idx on public.reminders(user_id, remind_at)",
  "attachments_user_created_idx on public.attachments(user_id, created_at desc)",
  "taggings_user_created_idx on public.taggings(user_id, created_at desc)",
  "grocery_items_user_created_idx on public.grocery_items(user_id, created_at desc)",
  "people_user_updated_idx on public.people(user_id, updated_at desc)",
  "goal_milestones_user_created_idx on public.goal_milestones(user_id, created_at desc)"
];

describe("migration security coverage", () => {
  it("enables RLS for every user-owned table", () => {
    for (const table of ownerScopedTables) {
      expect(migrationText).toContain(`alter table public.${table} enable row level security;`);
    }
  });

  it("adds owner-scoped policies for every user-owned table", () => {
    for (const table of ownerScopedTables) {
      const tablePolicies = policiesForTable(table);
      expect(tablePolicies.some((policy) => policy.includes("auth.uid() = user_id"))).toBe(true);
      expect(tablePolicies.some((policy) => policy.includes("with check (auth.uid() = user_id)"))).toBe(true);
    }
  });

  it("keeps dashboard owner reads backed by user-scoped indexes", () => {
    for (const index of dashboardOwnerIndexes) {
      expect(migrationText).toContain(`create index if not exists ${index};`);
    }
  });

  it("keeps attachments in a private owner-scoped bucket", () => {
    expect(migrationText).toContain("'orbit-attachments'");
    expect(migrationText).toContain("false");
    expect(migrationText).toContain("auth.uid()::text = (storage.foldername(name))[1]");
  });

  it("allows owners to delete their own private attachment objects", () => {
    expect(migrationText).toContain('create policy "users delete own orbit attachments" on storage.objects');
    expect(migrationText).toContain("for delete using");
    expect(migrationText).toContain("bucket_id = 'orbit-attachments'");
    expect(migrationText).toContain("auth.uid()::text = (storage.foldername(name))[1]");
  });

  it("enforces same-owner references for child tables with parent links", () => {
    const ownerReferenceTriggers = [
      "ensure_reminders_task_owner",
      "ensure_attachments_capture_owner",
      "ensure_focus_sessions_task_owner",
      "ensure_grocery_items_meal_plan_owner",
      "ensure_habit_logs_habit_owner",
      "ensure_goal_milestones_goal_owner"
    ];

    expect(migrationText).toContain("create or replace function public.ensure_orbit_same_owner_reference()");
    expect(migrationText).toContain("security definer");
    expect(migrationText).toContain("where id = $1 and user_id = $2");
    for (const trigger of ownerReferenceTriggers) {
      expect(migrationText).toContain(`create trigger ${trigger}`);
      expect(migrationText).toContain("execute function public.ensure_orbit_same_owner_reference");
    }
  });

  it("enforces same-owner tags and polymorphic tagging targets", () => {
    expect(migrationText).toContain("create or replace function public.ensure_orbit_tagging_same_owner()");
    expect(migrationText).toContain("create trigger ensure_taggings_same_owner");
    expect(migrationText).toContain("where id = new.tag_id and user_id = new.user_id");
    for (const target of ["task", "capture", "meal", "workout", "expense", "bill", "sleep", "focus_session", "meal_plan", "grocery_item"]) {
      expect(migrationText).toContain(`when '${target}' then`);
    }
  });
});

function policiesForTable(table: string) {
  return migrationText.match(new RegExp(`create policy[\\s\\S]*?on public\\.${table}\\b[\\s\\S]*?;`, "gi")) ?? [];
}
