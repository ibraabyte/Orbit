import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { Alert } from "react-native";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { backendMode, getApi } from "@/lib/backend";
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

async function loadDashboard(userId: string): Promise<DashboardData> {
  // Orbit's own server returns this whole bundle in one call, same shape (backend/app/routers/dashboard.py).
  if (backendMode() === "api") return { ...emptyData, ...(await getApi().get<Partial<DashboardData>>("/dashboard")) };
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

// Last good copy per user, so the app opens with data when offline. Writes still need a connection.
const CACHE_PREFIX = "orbit.cache.";
type CachedDashboard = { savedAt: string; data: DashboardData };

async function readCache(userId: string): Promise<CachedDashboard | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + userId);
    return raw ? (JSON.parse(raw) as CachedDashboard) : null;
  } catch {
    return null;
  }
}

export async function clearDashboardCache() {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(CACHE_PREFIX));
  await AsyncStorage.multiRemove(keys);
}

function useDashboardDataSource(userId: string) {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await loadDashboard(userId);
      setData(fresh);
      void AsyncStorage.setItem(CACHE_PREFIX + userId, JSON.stringify({ savedAt: new Date().toISOString(), data: fresh } satisfies CachedDashboard)).catch(() => undefined);
    } catch (loadError) {
      const cached = await readCache(userId);
      if (cached) {
        setData(cached.data);
        setError(`Offline. Showing what was saved ${new Date(cached.savedAt).toLocaleString()}.`);
      } else {
        setError(loadError instanceof Error ? loadError.message : "Data could not be loaded.");
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // Show the saved copy at once, then replace it with fresh data.
    void readCache(userId).then((cached) => cached && setData((current) => (current === emptyData ? cached.data : current)));
    void refresh();
  }, [refresh, userId]);

  // Personal data shouldn't outlive the session on a shared phone.
  useEffect(() => {
    const forgetSession = () => {
      void clearDashboardCache();
      // Scheduled alarms carry task and reminder titles; drop them with the session.
      void Notifications.cancelAllScheduledNotificationsAsync();
    };
    if (backendMode() === "api") {
      return getApi().onSessionChange((session) => {
        if (!session) forgetSession();
      });
    }
    const { data: listener } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") forgetSession();
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Run a write, then reload. Shows an alert instead of throwing so screens stay one-liners.
  const act = useCallback(
    async (write: () => PromiseLike<unknown>) => {
      try {
        const result = await write();
        const failure = result && typeof result === "object" && "error" in result ? (result.error as { message: string } | null) : null;
        if (failure) throw new Error(failure.message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await refresh();
      } catch (actError) {
        Alert.alert("Could not save", actError instanceof Error ? actError.message : "Try again.");
      }
    },
    [refresh]
  );

  return { userId, data, loading, error, refresh, act };
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
