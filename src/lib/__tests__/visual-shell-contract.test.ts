import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageHeaderText = readFileSync(join(process.cwd(), "src", "components", "page-header.tsx"), "utf8");
const dashboardHomeText = readFileSync(join(process.cwd(), "src", "components", "dashboard-home.tsx"), "utf8");
const planPageText = readFileSync(join(process.cwd(), "src", "components", "plan-page.tsx"), "utf8");
const reviewPageText = readFileSync(join(process.cwd(), "src", "components", "review-page.tsx"), "utf8");
const inboxPageText = readFileSync(join(process.cwd(), "src", "components", "inbox-page.tsx"), "utf8");
const tasksPageText = readFileSync(join(process.cwd(), "src", "components", "tasks-page.tsx"), "utf8");
const taskManagerText = readFileSync(join(process.cwd(), "src", "components", "task-manager.tsx"), "utf8");
const calendarPageText = readFileSync(join(process.cwd(), "src", "components", "calendar-page.tsx"), "utf8");
const focusPanelText = readFileSync(join(process.cwd(), "src", "components", "focus-panel.tsx"), "utf8");
const foodPanelText = readFileSync(join(process.cwd(), "src", "components", "food-panel.tsx"), "utf8");
const healthPanelText = readFileSync(join(process.cwd(), "src", "components", "health-panel.tsx"), "utf8");
const financePanelText = readFileSync(join(process.cwd(), "src", "components", "finance-panel.tsx"), "utf8");
const peoplePanelText = readFileSync(join(process.cwd(), "src", "components", "people-panel.tsx"), "utf8");
const habitsPanelText = readFileSync(join(process.cwd(), "src", "components", "habits-panel.tsx"), "utf8");
const goalsPanelText = readFileSync(join(process.cwd(), "src", "components", "goals-panel.tsx"), "utf8");
const journalPanelText = readFileSync(join(process.cwd(), "src", "components", "journal-panel.tsx"), "utf8");
const libraryPanelText = readFileSync(join(process.cwd(), "src", "components", "library-panel.tsx"), "utf8");
const insightsPageText = readFileSync(join(process.cwd(), "src", "components", "insights-page.tsx"), "utf8");
const settingsPanelText = readFileSync(join(process.cwd(), "src", "components", "settings-panel.tsx"), "utf8");
const shareTargetPageText = readFileSync(join(process.cwd(), "src", "components", "share-target-page.tsx"), "utf8");
const quickCaptureText = readFileSync(join(process.cwd(), "src", "components", "quick-capture.tsx"), "utf8");
const authFormText = readFileSync(join(process.cwd(), "src", "components", "auth-form.tsx"), "utf8");
const notFoundText = readFileSync(join(process.cwd(), "src", "app", "not-found.tsx"), "utf8");
const onboardingPanelText = readFileSync(join(process.cwd(), "src", "components", "onboarding-panel.tsx"), "utf8");
const commandPageText = readFileSync(join(process.cwd(), "src", "components", "command-page.tsx"), "utf8");
const searchPageText = readFileSync(join(process.cwd(), "src", "components", "search-page.tsx"), "utf8");
const globalCssText = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

describe("visible app shell design contract", () => {
  it("keeps every protected page header on the redesigned Drift surface", () => {
    // Drift: PageHeader delegates to the ui/* primitive built on design tokens.
    expect(pageHeaderText).toContain('from "@/components/ui/page-header"');
    const uiPageHeaderText = readFileSync(
      join(process.cwd(), "src", "components", "ui", "page-header.tsx"),
      "utf8"
    );
    expect(uiPageHeaderText).toContain("text-on-shell");
    expect(uiPageHeaderText).toContain("var(--text-h1)");
    // Drift tokens + legacy migration scaffold present in globals.css.
    expect(globalCssText).toContain("@theme");
    expect(globalCssText).toContain("--color-shell");
    expect(globalCssText).toContain("--radius-card");
    expect(globalCssText).toContain("@layer legacy");
  });

  it("keeps shared dashboard surfaces visibly redesigned", () => {
    expect(globalCssText).toContain(".module:hover");
    expect(globalCssText).toContain(".module-header");
    expect(globalCssText).toContain("border-bottom: 1px solid oklch(0.89 0.012 248 / 0.72)");
    expect(globalCssText).toContain(".stat-tile::before");
    expect(globalCssText).toContain(".stat-tile:has(.badge.warning)::before");
    expect(globalCssText).toContain(".stat-tile:hover");
    expect(globalCssText).toContain(".list-row::before");
    expect(globalCssText).toContain("a.list-row:hover::before");
    expect(globalCssText).toContain(".week-day::before");
  });

  it("keeps command and search surfaces visually distinct", () => {
    expect(commandPageText).toContain('from "@/components/ui/form"');
    expect(commandPageText).toContain("executeQuickAdd");
    expect(searchPageText).toContain('from "@/components/ui/form"');
    expect(globalCssText).toContain(".command-console .input");
    expect(globalCssText).toContain(".command-console .input:focus");
    expect(globalCssText).toContain(".notice.command-preview");
    expect(globalCssText).toContain(".notice.command-preview strong");
    expect(globalCssText).toContain(".search-surface .filter-bar");
    expect(globalCssText).toContain(".search-surface .search-field");
    expect(globalCssText).toContain(".search-surface .filter-select");
  });

  it("keeps global navigation visibly redesigned", () => {
    expect(globalCssText).toContain(".sidebar > .brand-mark");
    expect(globalCssText).toContain(".sidebar-quick-actions");
    expect(globalCssText).toContain(".quick-action-link.primary::before");
    expect(globalCssText).toContain(".nav-section:first-child");
    expect(globalCssText).toContain(".nav-link svg");
    expect(globalCssText).toContain(".nav-link.active svg");
    expect(globalCssText).toContain(".sidebar-footer");
    expect(globalCssText).toContain(".mobile-nav .nav-link.active");
    expect(globalCssText).toContain("box-shadow: 0 1px 0 oklch(1 0 0 / 0.85) inset");
  });

  it("keeps shared buttons and form controls polished", () => {
    expect(globalCssText).toContain(".button:focus-visible");
    expect(globalCssText).toContain(".icon-button:focus-visible");
    expect(globalCssText).toContain(".cadence-button:focus-visible");
    expect(globalCssText).toContain("radial-gradient(circle at 20% 0%");
    expect(globalCssText).toContain(".field:focus-within label");
    expect(globalCssText).toContain(".input:focus");
    expect(globalCssText).toContain("transform: translateY(-1px)");
    expect(globalCssText).toContain(".input:disabled");
    expect(globalCssText).toContain(".textarea:disabled");
    expect(globalCssText).toContain(".select:disabled");
  });

  it("keeps the Today dashboard as a composed command center", () => {
    expect(dashboardHomeText).toContain('from "@/components/ui/stat-tile"');
    expect(dashboardHomeText).toContain('from "@/components/ui/list-row"');
    expect(dashboardHomeText).toContain("DailyBriefList");
    expect(dashboardHomeText).toContain("grid grid-cols-2");
    expect(onboardingPanelText).toContain("onboarding-module");
    expect(globalCssText).toContain(".dashboard-brief");
    expect(globalCssText).toContain(".dashboard-brief-list");
    expect(globalCssText).toContain(".dashboard-brief-row.warning::before");
    expect(globalCssText).toContain(".dashboard-stats .stat-tile");
    expect(globalCssText).toContain(".onboarding-module .progress-meter");
  });

  it("keeps the Plan page as a weekly control surface", () => {
    expect(planPageText).toContain('from "@/components/ui/stat-tile"');
    expect(planPageText).toContain('from "@/components/ui/list-row"');
    expect(planPageText).toContain('from "@/components/ui/button"');
    expect(planPageText).toContain("grid grid-cols-2");
    expect(planPageText).toContain("Week execution map");
    expect(planPageText).toContain("Recommended actions");
    expect(planPageText).toContain("PlanMetric");
    expect(globalCssText).toContain(".plan-stats");
    expect(globalCssText).toContain(".plan-map-module .week-day");
    expect(globalCssText).toContain(".plan-action-row.warning::before");
    expect(globalCssText).toContain(".plan-metric-row.success::before");
  });

  it("keeps the Review page as a designed reflection workflow", () => {
    expect(reviewPageText).toContain('from "@/components/ui/segmented"');
    expect(reviewPageText).toContain('from "@/components/ui/stat-tile"');
    expect(reviewPageText).toContain('from "@/components/ui/list-row"');
    expect(reviewPageText).toContain('from "@/components/ui/form"');
    expect(reviewPageText).toContain("Review actions");
    expect(reviewPageText).toContain("Reflection prompts");
    expect(reviewPageText).toContain("Save reflection");
    expect(reviewPageText).toContain("Tomorrow handoff");
    expect(reviewPageText).toContain("ReviewJournalForm");
    expect(reviewPageText).toContain("ReviewHandoffPanel");
    expect(reviewPageText).toContain("ReviewMetricTile");
    expect(globalCssText).toContain(".review-stats");
    expect(globalCssText).toContain(".review-action-row.warning::before");
    expect(globalCssText).toContain(".review-reflection-module");
    expect(globalCssText).toContain(".review-journal-form .textarea");
  });

  it("keeps the Inbox page as a triage board", () => {
    expect(inboxPageText).toContain('from "@/components/ui/stat-tile"');
    expect(inboxPageText).toContain('from "@/components/ui/button"');
    expect(inboxPageText).toContain('from "@/components/ui/badge"');
    expect(inboxPageText).toContain("grid grid-cols-2");
    expect(inboxPageText).toContain("TriageRow");
    expect(inboxPageText).toContain("Inbox clear");
    expect(inboxPageText).toContain("triageTone");
    expect(inboxPageText).toContain("executeTriageAction");
    expect(inboxPageText).toContain("groupItems");
    expect(globalCssText).toContain(".inbox-stats");
    expect(globalCssText).toContain(".inbox-stat-tile.has-items");
    expect(globalCssText).toContain(".inbox-group-grid");
    expect(globalCssText).toContain(".inbox-row.warning::before");
    expect(globalCssText).toContain(".inbox-row-actions .cadence-button");
  });

  it("keeps the Tasks page as a workbench", () => {
    expect(tasksPageText).toContain('from "@/components/ui/stat-tile"');
    expect(tasksPageText).toContain("grid grid-cols-2");
    expect(tasksPageText).toContain("TaskManager");
    expect(taskManagerText).toContain('from "@/components/ui/form"');
    expect(taskManagerText).toContain('from "@/components/ui/button"');
    expect(taskManagerText).toContain('from "@/components/ui/badge"');
    expect(taskManagerText).toContain("TaskComposer");
    expect(taskManagerText).toContain("TaskList");
    expect(taskManagerText).toContain("ReminderComposer");
    expect(taskManagerText).toContain("ReminderList");
    expect(taskManagerText).toContain("TagBadges");
    expect(taskManagerText).toContain("rounded-tile");
    expect(globalCssText).toContain(".task-stats");
    expect(globalCssText).toContain(".task-workbench");
    expect(globalCssText).toContain(".task-row.high::before");
    expect(globalCssText).toContain(".task-reminder-row .snooze-group");
  });

  it("keeps the Calendar page as a two-week agenda surface", () => {
    expect(calendarPageText).toContain('from "@/components/ui/stat-tile"');
    expect(calendarPageText).toContain('from "@/components/ui/list-row"');
    expect(calendarPageText).toContain('from "@/components/ui/button"');
    expect(calendarPageText).toContain("grid grid-cols-2");
    expect(calendarPageText).toContain("downloadIcsCalendar");
    expect(calendarPageText).toContain("eventKindTone");
    expect(calendarPageText).toContain("kindLabels");
    expect(calendarPageText).toContain("No scheduled items");
    expect(globalCssText).toContain(".calendar-stats");
    expect(globalCssText).toContain(".calendar-day-module.has-events");
    expect(globalCssText).toContain(".calendar-event-reminder::before");
    expect(globalCssText).toContain(".calendar-event-mealPlan::before");
    expect(globalCssText).toContain(".calendar-empty-day");
  });

  it("keeps the Focus page as a session workbench", () => {
    expect(focusPanelText).toContain('from "@/components/ui/form"');
    expect(focusPanelText).toContain('from "@/components/ui/segmented"');
    expect(focusPanelText).toContain('from "@/components/ui/stat-tile"');
    expect(focusPanelText).toContain('from "@/components/ui/button"');
    expect(focusPanelText).toContain("FocusComposer");
    expect(focusPanelText).toContain("FocusRecent");
    expect(focusPanelText).toContain("updateStatus");
    expect(focusPanelText).toContain("NumberField");
    expect(focusPanelText).toContain("grid grid-cols-2");
    expect(focusPanelText).toContain("rounded-tile");
    expect(globalCssText).toContain(".focus-workbench");
    expect(globalCssText).toContain(".focus-mode-switch");
    expect(globalCssText).toContain(".focus-session-planned::before");
    expect(globalCssText).toContain(".focus-session-cancelled::before");
  });

  it("keeps the Food page as a planning board", () => {
    expect(foodPanelText).toContain('from "@/components/ui/form"');
    expect(foodPanelText).toContain('from "@/components/ui/segmented"');
    expect(foodPanelText).toContain('from "@/components/ui/stat-tile"');
    expect(foodPanelText).toContain('from "@/components/ui/button"');
    expect(foodPanelText).toContain("FoodComposer");
    expect(foodPanelText).toContain("FoodRecent");
    expect(foodPanelText).toContain("SectionHeading");
    expect(foodPanelText).toContain("updateMealStatus");
    expect(foodPanelText).toContain("updateGroceryStatus");
    expect(foodPanelText).toContain("grid grid-cols-2");
    expect(foodPanelText).toContain("rounded-tile");
    expect(globalCssText).toContain(".food-board");
    expect(globalCssText).toContain(".food-mode-switch");
    expect(globalCssText).toContain(".food-meal-prepped::before");
    expect(globalCssText).toContain(".food-missing-row::before");
    expect(globalCssText).toContain(".food-grocery-group");
  });

  it("keeps the Health page as a logbook", () => {
    expect(healthPanelText).toContain('from "@/components/ui/form"');
    expect(healthPanelText).toContain('from "@/components/ui/segmented"');
    expect(healthPanelText).toContain('from "@/components/ui/stat-tile"');
    expect(healthPanelText).toContain('from "@/components/ui/button"');
    expect(healthPanelText).toContain("HealthComposer");
    expect(healthPanelText).toContain("HealthRecent");
    expect(healthPanelText).toContain("HealthSnapshotTiles");
    expect(healthPanelText).toContain("NumberField");
    expect(healthPanelText).toContain("grid grid-cols-2");
    expect(healthPanelText).toContain("rounded-tile");
    expect(globalCssText).toContain(".health-board");
    expect(globalCssText).toContain(".health-mode-switch");
    expect(globalCssText).toContain(".health-log-workout::before");
    expect(globalCssText).toContain(".health-log-sleep::before");
    expect(globalCssText).toContain(".health-log-meal::before");
  });

  it("keeps the Finance page as a money ledger", () => {
    expect(financePanelText).toContain('from "@/components/ui/form"');
    expect(financePanelText).toContain('from "@/components/ui/segmented"');
    expect(financePanelText).toContain('from "@/components/ui/stat-tile"');
    expect(financePanelText).toContain('from "@/components/ui/check-item"');
    expect(financePanelText).toContain("FinanceComposer");
    expect(financePanelText).toContain("FinanceRecent");
    expect(financePanelText).toContain("markPaid");
    expect(financePanelText).toContain("togglePaused");
    expect(financePanelText).toContain("grid grid-cols-2");
    expect(financePanelText).toContain("rounded-tile");
    expect(financePanelText).toContain("TagRow");
    expect(globalCssText).toContain(".finance-board");
    expect(globalCssText).toContain(".finance-mode-switch");
    expect(globalCssText).toContain(".finance-bill-row::before");
    expect(globalCssText).toContain(".finance-expense-row::before");
  });

  it("keeps the People page as a relationship directory", () => {
    expect(peoplePanelText).toContain('from "@/components/ui/form"');
    expect(peoplePanelText).toContain('from "@/components/ui/stat-tile"');
    expect(peoplePanelText).toContain('from "@/components/ui/check-item"');
    expect(peoplePanelText).toContain('from "@/components/ui/button"');
    expect(peoplePanelText).toContain("PeopleComposer");
    expect(peoplePanelText).toContain("PeopleRecent");
    expect(peoplePanelText).toContain("markContacted");
    expect(peoplePanelText).toContain("toggleFavorite");
    expect(peoplePanelText).toContain("grid grid-cols-2");
    expect(peoplePanelText).toContain("rounded-tile");
    expect(globalCssText).toContain(".people-board");
    expect(globalCssText).toContain(".people-row.is-due::before");
    expect(globalCssText).toContain(".people-row.is-favorite::before");
    expect(globalCssText).toContain(".people-row-actions .cadence-group");
  });

  it("keeps the Habits page as a routine board", () => {
    expect(habitsPanelText).toContain('from "@/components/ui/form"');
    expect(habitsPanelText).toContain('from "@/components/ui/progress-bar"');
    expect(habitsPanelText).toContain('from "@/components/ui/button"');
    expect(habitsPanelText).toContain("HabitComposer");
    expect(habitsPanelText).toContain("HabitList");
    expect(habitsPanelText).toContain("checkIn");
    expect(habitsPanelText).toContain("archive");
    expect(habitsPanelText).toContain("ProgressBar");
    expect(habitsPanelText).toContain("rounded-tile");
    expect(globalCssText).toContain(".habits-board");
    expect(globalCssText).toContain(".habit-row.has-streak::before");
    expect(globalCssText).toContain(".habit-row.is-complete::before");
    expect(globalCssText).toContain(".habit-row .progress-meter");
  });

  it("keeps the Goals page as an outcome board", () => {
    expect(goalsPanelText).toContain('from "@/components/ui/form"');
    expect(goalsPanelText).toContain('from "@/components/ui/progress-bar"');
    expect(goalsPanelText).toContain('from "@/components/ui/button"');
    expect(goalsPanelText).toContain("GoalComposer");
    expect(goalsPanelText).toContain("GoalList");
    expect(goalsPanelText).toContain("GoalRow");
    expect(goalsPanelText).toContain("toggleMilestone");
    expect(goalsPanelText).toContain("addMilestone");
    expect(goalsPanelText).toContain("ProgressBar");
    expect(globalCssText).toContain(".goals-board");
    expect(globalCssText).toContain(".goal-row-completed::before");
    expect(globalCssText).toContain(".goal-row .progress-meter");
    expect(globalCssText).toContain(".goal-milestone-list");
  });

  it("keeps the Journal page as a reflection log", () => {
    expect(journalPanelText).toContain('from "@/components/ui/form"');
    expect(journalPanelText).toContain('from "@/components/ui/segmented"');
    expect(journalPanelText).toContain('from "@/components/ui/stat-tile"');
    expect(journalPanelText).toContain('from "@/components/ui/button"');
    expect(journalPanelText).toContain("JournalComposer");
    expect(journalPanelText).toContain("JournalStats");
    expect(journalPanelText).toContain("JournalList");
    expect(journalPanelText).toContain("moodTone");
    expect(journalPanelText).toContain("grid grid-cols-2");
    expect(journalPanelText).toContain("rounded-tile");
    expect(globalCssText).toContain(".journal-board");
    expect(globalCssText).toContain(".journal-mood-switch");
    expect(globalCssText).toContain(".journal-entry-great::before");
    expect(globalCssText).toContain(".journal-entry-low::before");
  });

  it("keeps the Library page as a saved-content board", () => {
    expect(libraryPanelText).toContain('from "@/components/ui/chip"');
    expect(libraryPanelText).toContain('from "@/components/ui/stat-tile"');
    expect(libraryPanelText).toContain('from "@/components/ui/form"');
    expect(libraryPanelText).toContain('from "@/components/ui/button"');
    expect(libraryPanelText).toContain("CaptureList");
    expect(libraryPanelText).toContain("CaptureStat");
    expect(libraryPanelText).toContain("toggleCollection");
    expect(libraryPanelText).toContain("createFollowUpTask");
    expect(libraryPanelText).toContain("grid grid-cols-2");
    expect(libraryPanelText).toContain("rounded-tile");
    expect(globalCssText).toContain(".library-board");
    expect(globalCssText).toContain(".library-filter-bar");
    expect(globalCssText).toContain(".library-capture-screenshot::before");
    expect(globalCssText).toContain(".library-capture-row.needs-triage::before");
  });

  it("keeps the Insights page as an analytics board", () => {
    expect(insightsPageText).toContain('from "@/components/ui/stat-tile"');
    expect(insightsPageText).toContain('from "@/components/ui/list-row"');
    expect(insightsPageText).toContain('from "@/components/ui/badge"');
    expect(insightsPageText).toContain("InsightTile");
    expect(insightsPageText).toContain("MetricBars");
    expect(insightsPageText).toContain("caloriesByDay");
    expect(insightsPageText).toContain("Next actions");
    expect(insightsPageText).toContain("grid grid-cols-2");
    expect(insightsPageText).toContain("Trend chart");
    expect(insightsPageText).toContain("bg-accent-deep");
    expect(insightsPageText).toContain("StatTile");
    expect(globalCssText).toContain(".insights-kpis");
    expect(globalCssText).toContain(".insights-board");
    expect(globalCssText).toContain(".insight-metric-bars .metric-bar-track");
    expect(globalCssText).toContain(".insights-action-row::before");
  });

  it("keeps the Settings page as an account control room", () => {
    expect(settingsPanelText).toContain('from "@/components/ui/form"');
    expect(settingsPanelText).toContain('from "@/components/ui/button"');
    expect(settingsPanelText).toContain('from "@/components/ui/check-item"');
    expect(settingsPanelText).toContain("ProfilePreferences");
    expect(settingsPanelText).toContain("LocalPrivacyPanel");
    expect(settingsPanelText).toContain("BrowserCapturePanel");
    expect(settingsPanelText).toContain("deleteAccount");
    expect(settingsPanelText).toContain("saveProfile");
    expect(settingsPanelText).toContain("Delete account");
    expect(settingsPanelText).toContain("Dashboard modules");
    expect(settingsPanelText).toContain("grid grid-cols-2");
    expect(settingsPanelText).toContain("rounded-tile");
    expect(globalCssText).toContain(".settings-board");
    expect(globalCssText).toContain(".settings-danger-row::before");
    expect(globalCssText).toContain(".settings-danger-zone");
    expect(globalCssText).toContain(".settings-side-stack .module::after");
  });

  it("keeps the Share Target page as a focused capture handoff", () => {
    expect(shareTargetPageText).toContain('from "@/components/ui/list-row"');
    expect(shareTargetPageText).toContain("QuickCapture");
    expect(shareTargetPageText).toContain("Shared capture");
    expect(shareTargetPageText).toContain("Review handoff");
    expect(shareTargetPageText).toContain("normalizeSharedCapture");
    expect(quickCaptureText).toContain('from "@/components/ui/form"');
    expect(quickCaptureText).toContain('from "@/components/ui/segmented"');
    expect(globalCssText).toContain(".share-target-board");
    expect(globalCssText).toContain(".share-target-review-row::before");
    expect(globalCssText).toContain(".quick-capture-form.capture-drop-active");
    expect(globalCssText).toContain(".capture-type-switch");
  });

  it("keeps auth pages as a branded workspace entry", () => {
    expect(authFormText).toContain("auth-layout");
    expect(authFormText).toContain("auth-form-panel");
    expect(authFormText).toContain("auth-fields");
    expect(authFormText).toContain("auth-proof-panel");
    expect(authFormText).toContain("auth-proof-header");
    expect(authFormText).toContain("auth-hero-word");
    expect(authFormText).toContain("auth-proof-metrics");
    expect(authFormText).toContain("auth-proof-list");
    expect(authFormText).toContain("auth-proof-row");
    expect(globalCssText).toContain(".auth-layout");
    expect(globalCssText).toContain(".auth-fields");
    expect(globalCssText).toContain(".auth-shell::before");
    expect(globalCssText).toContain(".auth-proof-metrics");
    expect(globalCssText).toContain(".auth-proof-panel::before");
    expect(globalCssText).toContain(".auth-proof-row.warning::before");
  });

  it("keeps the 404 page as a useful recovery route", () => {
    expect(notFoundText).toContain("not-found-layout");
    expect(notFoundText).toContain("not-found-panel");
    expect(notFoundText).toContain("not-found-map");
    expect(notFoundText).toContain("not-found-route-list");
    expect(notFoundText).toContain("not-found-route-row");
    expect(globalCssText).toContain(".not-found-layout");
    expect(globalCssText).toContain(".not-found-map");
    expect(globalCssText).toContain(".not-found-route-row::before");
  });
});
