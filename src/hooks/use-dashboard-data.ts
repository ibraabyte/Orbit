"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { flushQueuedCaptures, loadCachedDashboard, saveDashboardCache } from "@/lib/offline-queue";
import type {
  Attachment,
  Bill,
  Capture,
  DashboardData,
  Expense,
  FocusSession,
  Goal,
  GoalMilestone,
  GroceryItem,
  Habit,
  HabitLog,
  JournalEntry,
  Meal,
  MealPlan,
  Person,
  Profile,
  Reminder,
  SleepLog,
  Tag,
  Tagging,
  Task,
  WeightLog,
  Workout
} from "@/lib/types";

const emptyData: DashboardData = {
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

type DashboardDataValue = ReturnType<typeof useDashboardDataSource>;

// Fetches the full owner-scoped dataset. Mounted once via DashboardDataProvider so
// tab switches read from context instead of re-firing 22 queries per navigation.
export function useDashboardDataSource(userId: string | undefined) {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const syncingQueuedCaptures = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setData(emptyData);
      setLoading(false);
      setError(null);
      setSyncMessage(null);
      return;
    }
    setLoading(true);
    setError(null);

    if (!navigator.onLine) {
      const cached = await loadCachedDashboard(userId);
      if (cached) {
        setData(cached.data);
        setError("Showing last saved offline copy. New changes will load when you reconnect.");
      }
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    const showLoadErrorWithCachedFallback = async (message: string) => {
      const cached = await loadCachedDashboard(userId).catch(() => null);
      if (cached) {
        setData(cached.data);
        setError(`${message}. Showing last saved offline copy.`);
      } else {
        setError(message);
      }
      setLoading(false);
    };

    try {
      const [
        profile,
        tasks,
        reminders,
        captures,
        attachments,
        tags,
        taggings,
        meals,
        mealPlans,
        groceryItems,
        people,
        weightLogs,
        workouts,
        sleepLogs,
        focusSessions,
        habits,
        habitLogs,
        goals,
        goalMilestones,
        journalEntries,
        expenses,
        bills
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(80),
        supabase.from("reminders").select("*").eq("user_id", userId).order("remind_at", { ascending: true }).limit(80),
        supabase.from("captures").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(60),
        supabase.from("attachments").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(80),
        supabase.from("tags").select("*").eq("user_id", userId).order("name", { ascending: true }).limit(120),
        supabase.from("taggings").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(240),
        supabase.from("meals").select("*").eq("user_id", userId).order("logged_at", { ascending: false }).limit(80),
        supabase.from("meal_plans").select("*").eq("user_id", userId).order("plan_date", { ascending: false }).limit(120),
        supabase.from("grocery_items").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(160),
        supabase.from("people").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(120),
        supabase.from("weight_logs").select("*").eq("user_id", userId).order("logged_at", { ascending: false }).limit(40),
        supabase.from("workouts").select("*").eq("user_id", userId).order("logged_at", { ascending: false }).limit(50),
        supabase.from("sleep_logs").select("*").eq("user_id", userId).order("sleep_date", { ascending: false }).limit(90),
        supabase.from("focus_sessions").select("*").eq("user_id", userId).order("started_at", { ascending: false }).limit(120),
        supabase.from("habits").select("*").eq("user_id", userId).is("archived_at", null).order("created_at", { ascending: false }).limit(60),
        supabase.from("habit_logs").select("*").eq("user_id", userId).order("logged_at", { ascending: false }).limit(240),
        supabase.from("goals").select("*").eq("user_id", userId).neq("status", "archived").order("updated_at", { ascending: false }).limit(60),
        supabase.from("goal_milestones").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(240),
        supabase.from("journal_entries").select("*").eq("user_id", userId).order("entry_date", { ascending: false }).limit(90),
        supabase.from("expenses").select("*").eq("user_id", userId).order("spent_at", { ascending: false }).limit(120),
        supabase.from("bills").select("*").eq("user_id", userId).order("due_at", { ascending: true }).limit(80)
      ]);

      const firstError = [
        profile,
        tasks,
        reminders,
        captures,
        attachments,
        tags,
        taggings,
        meals,
        mealPlans,
        groceryItems,
        people,
        weightLogs,
        workouts,
        sleepLogs,
        focusSessions,
        habits,
        habitLogs,
        goals,
        goalMilestones,
        journalEntries,
        expenses,
        bills
      ].find((result) => result.error)?.error;
      if (firstError) {
        await showLoadErrorWithCachedFallback(firstError.message);
        return;
      }

      const nextData = {
        profile: (profile.data ?? null) as Profile | null,
        tasks: (tasks.data ?? []) as Task[],
        reminders: (reminders.data ?? []) as Reminder[],
        captures: (captures.data ?? []) as Capture[],
        attachments: (attachments.data ?? []) as Attachment[],
        tags: (tags.data ?? []) as Tag[],
        taggings: (taggings.data ?? []) as Tagging[],
        meals: (meals.data ?? []) as Meal[],
        mealPlans: (mealPlans.data ?? []) as MealPlan[],
        groceryItems: (groceryItems.data ?? []) as GroceryItem[],
        people: (people.data ?? []) as Person[],
        weightLogs: (weightLogs.data ?? []) as WeightLog[],
        workouts: (workouts.data ?? []) as Workout[],
        sleepLogs: (sleepLogs.data ?? []) as SleepLog[],
        focusSessions: (focusSessions.data ?? []) as FocusSession[],
        habits: (habits.data ?? []) as Habit[],
        habitLogs: (habitLogs.data ?? []) as HabitLog[],
        goals: (goals.data ?? []) as Goal[],
        goalMilestones: (goalMilestones.data ?? []) as GoalMilestone[],
        journalEntries: (journalEntries.data ?? []) as JournalEntry[],
        expenses: (expenses.data ?? []) as Expense[],
        bills: (bills.data ?? []) as Bill[]
      };

      setData(nextData);
      await saveDashboardCache(userId, nextData).catch(() => undefined);
      setLoading(false);
    } catch (loadError) {
      await showLoadErrorWithCachedFallback(loadError instanceof Error ? loadError.message : "Dashboard data could not be loaded.");
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const syncQueuedCaptures = useCallback(async () => {
    if (!userId || !navigator.onLine || syncingQueuedCaptures.current) return;
    syncingQueuedCaptures.current = true;

    try {
      const count = await flushQueuedCaptures(userId);
      if (count) {
        setSyncMessage(`${count} offline capture${count === 1 ? "" : "s"} synced.`);
        await refresh();
      }
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Offline captures could not be synced.");
    } finally {
      syncingQueuedCaptures.current = false;
    }
  }, [refresh, userId]);

  useEffect(() => {
    if (!userId) return;
    void syncQueuedCaptures();
    window.addEventListener("online", syncQueuedCaptures);
    return () => window.removeEventListener("online", syncQueuedCaptures);
  }, [syncQueuedCaptures, userId]);

  return { data, loading, error, refresh, syncMessage };
}

const DashboardDataContext = createContext<DashboardDataValue | null>(null);

export function DashboardDataProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const value = useDashboardDataSource(userId);
  return createElement(DashboardDataContext.Provider, { value }, children);
}

export function useDashboardData() {
  const value = useContext(DashboardDataContext);
  if (!value) {
    throw new Error("useDashboardData must be used inside DashboardDataProvider.");
  }
  return value;
}
