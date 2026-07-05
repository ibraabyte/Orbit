import { describe, expect, it } from "vitest";
import { defaultDashboardWidgets, normalizeDashboardWidgets, toggleDashboardWidget } from "@/lib/dashboard-widgets";

describe("dashboard widgets", () => {
  it("uses defaults when a profile has no saved dashboard modules", () => {
    expect(normalizeDashboardWidgets(null)).toEqual(defaultDashboardWidgets);
    expect(normalizeDashboardWidgets([])).toEqual(defaultDashboardWidgets);
  });

  it("drops invalid and duplicate widgets while keeping product order", () => {
    expect(normalizeDashboardWidgets(["food", "unknown", "tasks", "food", "journal"])).toEqual(["tasks", "food", "journal"]);
  });

  it("toggles widgets without allowing an empty dashboard", () => {
    expect(toggleDashboardWidget(["tasks", "food"], "food")).toEqual(["tasks"]);
    expect(toggleDashboardWidget(["tasks"], "tasks")).toEqual(["tasks"]);
    expect(toggleDashboardWidget(["tasks"], "health")).toEqual(["tasks", "health"]);
  });
});
