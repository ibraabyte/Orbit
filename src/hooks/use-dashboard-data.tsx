import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { Alert } from "react-native";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getApi } from "@/lib/backend";
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

// Orbit's own server returns the whole bundle in one call, same shape (backend/app/routers/dashboard.py).
async function loadDashboard(): Promise<DashboardData> {
  return { ...emptyData, ...(await getApi().get<Partial<DashboardData>>("/dashboard")) };
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
      const fresh = await loadDashboard();
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
    return getApi().onSessionChange((session) => {
      if (!session) forgetSession();
    });
  }, []);

  // Run a write, then reload. Shows an alert instead of throwing so screens stay one-liners.
  const act = useCallback(
    async (write: () => PromiseLike<unknown>) => {
      try {
        await write();
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
