import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";
import type { DashboardData } from "@/lib/types";

export const emptyData: DashboardData = {
  profile: null,
  tasks: [],
  reminders: [],
  captures: [],
  attachments: [],
  tags: [],
  taggings: [],
  meals: [],
  mealPlans: [],
  groceryItems: [],
  people: [],
  weightLogs: [],
  workouts: [],
  sleepLogs: [],
  focusSessions: [],
  habits: [],
  habitLogs: [],
  goals: [],
  goalMilestones: [],
  journalEntries: [],
  expenses: [],
  bills: []
};

// key in DashboardData, table, order column, ascending, limit
const listQueries = [
  ["tasks", "tasks", "created_at", false, 80],
  ["reminders", "reminders", "remind_at", true, 80],
  ["captures", "captures", "created_at", false, 60],
  ["attachments", "attachments", "created_at", false, 80],
  ["tags", "tags", "name", true, 120],
  ["taggings", "taggings", "created_at", false, 240],
  ["meals", "meals", "logged_at", false, 80],
  ["mealPlans", "meal_plans", "plan_date", false, 120],
  ["groceryItems", "grocery_items", "created_at", false, 160],
  ["people", "people", "updated_at", false, 120],
  ["weightLogs", "weight_logs", "logged_at", false, 40],
  ["workouts", "workouts", "logged_at", false, 50],
  ["sleepLogs", "sleep_logs", "sleep_date", false, 90],
  ["focusSessions", "focus_sessions", "started_at", false, 120],
  ["habits", "habits", "created_at", false, 60],
  ["habitLogs", "habit_logs", "logged_at", false, 240],
  ["goals", "goals", "updated_at", false, 60],
  ["goalMilestones", "goal_milestones", "created_at", false, 240],
  ["journalEntries", "journal_entries", "entry_date", false, 90],
  ["expenses", "expenses", "spent_at", false, 120],
  ["bills", "bills", "due_at", true, 80]
] as const;

// ponytail: no offline cache yet; the plan swaps the web IndexedDB queue for expo-sqlite later.
async function loadDashboard(userId: string): Promise<DashboardData> {
  const supabase = getSupabase();
  const [profile, ...lists] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    ...listQueries.map(([key, table, column, ascending, limit]) => {
      let query = supabase.from(table).select("*").eq("user_id", userId);
      if (key === "habits") query = query.is("archived_at", null);
      if (key === "goals") query = query.neq("status" as never, "archived");
      return query.order(column, { ascending }).limit(limit);
    })
  ]);

  const firstError = [profile, ...lists].find((result) => result.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const data = { ...emptyData, profile: profile.data ?? null } as Record<string, unknown>;
  listQueries.forEach(([key], index) => {
    data[key] = lists[index].data ?? [];
  });
  return data as DashboardData;
}

function useDashboardDataSource(userId: string) {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadDashboard(userId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { userId, data, loading, error, refresh };
}

const DashboardDataContext = createContext<ReturnType<typeof useDashboardDataSource> | null>(null);

export function DashboardDataProvider({ userId, children }: { userId: string; children: ReactNode }) {
  return <DashboardDataContext.Provider value={useDashboardDataSource(userId)}>{children}</DashboardDataContext.Provider>;
}

export function useDashboardData() {
  const value = useContext(DashboardDataContext);
  if (!value) throw new Error("useDashboardData must be used inside DashboardDataProvider.");
  return value;
}
