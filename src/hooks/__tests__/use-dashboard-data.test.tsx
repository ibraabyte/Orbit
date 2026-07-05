import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import type { DashboardData } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  flushQueuedCaptures: vi.fn(),
  loadCachedDashboard: vi.fn(),
  saveDashboardCache: vi.fn(),
  getSupabase: vi.fn()
}));

const ownerScopedDashboardTables = [
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
  "habits",
  "habit_logs",
  "goals",
  "goal_milestones",
  "journal_entries",
  "expenses",
  "bills"
];

vi.mock("@/lib/offline-queue", () => ({
  flushQueuedCaptures: mocks.flushQueuedCaptures,
  loadCachedDashboard: mocks.loadCachedDashboard,
  saveDashboardCache: mocks.saveDashboardCache
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: mocks.getSupabase
}));

function Probe({ userId = "user-1" }: { userId?: string | null }) {
  const { data, loading, syncMessage, error } = useDashboardData(userId ?? undefined);
  return React.createElement(
    "div",
    null,
    React.createElement("span", { "data-testid": "loading" }, String(loading)),
    React.createElement("span", { "data-testid": "tasks" }, String(data.tasks.length)),
    React.createElement("span", { "data-testid": "sync" }, syncMessage ?? ""),
    React.createElement("span", { "data-testid": "error" }, error ?? "")
  );
}

describe("useDashboardData offline sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSupabase.mockReturnValue(mockSupabase());
    mocks.loadCachedDashboard.mockResolvedValue(null);
    mocks.saveDashboardCache.mockResolvedValue(undefined);
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it("flushes queued captures from any route that uses dashboard data", async () => {
    mocks.flushQueuedCaptures.mockResolvedValue(2);

    render(React.createElement(Probe));

    await waitFor(() => expect(screen.getByTestId("sync")).toHaveTextContent("2 offline captures synced."));
    expect(mocks.flushQueuedCaptures).toHaveBeenCalledWith("user-1");
    expect(mocks.saveDashboardCache).toHaveBeenCalled();
  });

  it("clears loading without querying when no user is available", async () => {
    render(React.createElement(Probe, { userId: null }));

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("tasks")).toHaveTextContent("0");
    expect(screen.getByTestId("error")).toHaveTextContent("");
    expect(screen.getByTestId("sync")).toHaveTextContent("");
    expect(mocks.getSupabase).not.toHaveBeenCalled();
    expect(mocks.loadCachedDashboard).not.toHaveBeenCalled();
    expect(mocks.flushQueuedCaptures).not.toHaveBeenCalled();
  });

  it("flushes queued captures when the browser comes back online", async () => {
    setOnline(false);
    mocks.flushQueuedCaptures.mockResolvedValue(1);

    render(React.createElement(Probe));

    await waitFor(() => expect(mocks.loadCachedDashboard).toHaveBeenCalledWith("user-1"));
    expect(mocks.flushQueuedCaptures).not.toHaveBeenCalled();

    setOnline(true);
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(screen.getByTestId("sync")).toHaveTextContent("1 offline capture synced."));
    expect(mocks.flushQueuedCaptures).toHaveBeenCalledWith("user-1");
  });

  it("falls back to cached dashboard data when an online request rejects", async () => {
    mocks.getSupabase.mockReturnValue(mockSupabase({ rejectTable: "tasks" }));
    mocks.loadCachedDashboard.mockResolvedValue({
      data: dashboardData({
        tasks: [{ id: "cached-task" } as never]
      })
    });

    render(React.createElement(Probe));

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("tasks")).toHaveTextContent("1");
    expect(screen.getByTestId("error")).toHaveTextContent("tasks request failed. Showing last saved offline copy.");
  });

  it("keeps live data visible when saving the offline dashboard cache fails", async () => {
    mocks.saveDashboardCache.mockRejectedValue(new Error("IndexedDB unavailable"));

    render(React.createElement(Probe));

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("error")).toHaveTextContent("");
  });

  it("adds explicit owner filters to every user-scoped dashboard query", async () => {
    const filters: Array<{ table: string; column: string; value: string }> = [];
    mocks.flushQueuedCaptures.mockResolvedValue(0);
    mocks.getSupabase.mockReturnValue(mockSupabase({ filters }));

    render(React.createElement(Probe));

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(filters).toEqual(
      expect.arrayContaining([
        { table: "profiles", column: "id", value: "user-1" },
        ...ownerScopedDashboardTables.map((table) => ({ table, column: "user_id", value: "user-1" }))
      ])
    );
  });
});

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value
  });
}

function mockSupabase(options: { rejectTable?: string; filters?: Array<{ table: string; column: string; value: string }> } = {}) {
  return {
    from(table: string) {
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: string) {
          options.filters?.push({ table, column, value });
          return query;
        },
        order() {
          return query;
        },
        is() {
          return query;
        },
        neq() {
          return query;
        },
        maybeSingle() {
          if (options.rejectTable === table) return Promise.reject(new Error(`${table} request failed`));
          return Promise.resolve({ data: null, error: null });
        },
        limit() {
          if (options.rejectTable === table) return Promise.reject(new Error(`${table} request failed`));
          return Promise.resolve({ data: [], error: null });
        }
      };

      return query;
    }
  };
}

function dashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
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
    bills: [],
    ...overrides
  };
}
