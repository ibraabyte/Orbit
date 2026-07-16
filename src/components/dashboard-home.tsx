"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BarChart3, Bell, CalendarDays, ClipboardCheck, ClipboardList, Command as CommandIcon, CreditCard, Flame, Inbox, Loader2, Plus, Scale, SquareCheckBig, Timer, Users, Utensils } from "lucide-react";
import { FinancePanel } from "@/components/finance-panel";
import { FoodPanel } from "@/components/food-panel";
import { FocusPanel } from "@/components/focus-panel";
import { PeoplePanel } from "@/components/people-panel";
import { useAuth } from "@/components/auth-provider";
import { GoalsPanel } from "@/components/goals-panel";
import { HabitsPanel } from "@/components/habits-panel";
import { HealthPanel } from "@/components/health-panel";
import { JournalPanel } from "@/components/journal-panel";
import { LibraryPanel } from "@/components/library-panel";
import { LoadingBlock } from "@/components/loading-block";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { OnboardingPanel } from "@/components/onboarding-panel";
import { PageHeader } from "@/components/page-header";
import { TaskManager } from "@/components/task-manager";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { StatTile } from "@/components/ui/stat-tile";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { buildDailyBrief, dueReminders, dueTaskReminders, summarizeDashboard, todaysTasks, weeklySummary, type DailyBriefItem } from "@/lib/dashboard";
import { dashboardWidgetSet } from "@/lib/dashboard-widgets";
import { buildCalendarDays } from "@/lib/calendar";
import { formatShortDate, formatTime } from "@/lib/dates";
import { insightSummary } from "@/lib/insights";
import { financeSummary, formatMoney } from "@/lib/finance";
import { foodSummary } from "@/lib/food";
import { formatFocusDuration } from "@/lib/focus";
import { peopleSummary } from "@/lib/people";
import { SNOOZE_PRESETS, snoozePresetLabel, snoozeReminderAt, type SnoozePreset } from "@/lib/reminders";
import { formatSleepDuration } from "@/lib/sleep";
import { getSupabase } from "@/lib/supabase";

export function DashboardHome() {
  const { user } = useAuth();
  const { data, loading, error, refresh, syncMessage } = useDashboardData();
  const [snoozingId, setSnoozingId] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);

  const summary = useMemo(() => summarizeDashboard(data), [data]);
  const brief = useMemo(() => buildDailyBrief(data), [data]);
  const insights = useMemo(() => insightSummary(data), [data]);
  const finance = useMemo(() => financeSummary(data), [data]);
  const food = useMemo(() => foodSummary(data), [data]);
  const people = useMemo(() => peopleSummary(data), [data]);
  const week = useMemo(() => weeklySummary(data), [data]);
  const dashboardWidgets = useMemo(() => dashboardWidgetSet(data.profile?.dashboard_modules), [data.profile?.dashboard_modules]);
  const dailyCalorieTarget = data.profile?.daily_calorie_target ?? null;
  const weeklyWorkoutTarget = data.profile?.weekly_workout_minutes_target ?? 150;
  const upcomingDays = useMemo(() => buildCalendarDays(data, 7), [data]);
  const upcomingEvents = upcomingDays.flatMap((day) => day.events).slice(0, 4);
  const todayTasks = useMemo(() => todaysTasks(data.tasks).slice(0, 6), [data.tasks]);
  const dueStandaloneReminders = useMemo(() => dueReminders(data.reminders, new Date(), data.tasks), [data.reminders, data.tasks]);
  const dueTaskReminderRows = useMemo(() => dueTaskReminders(data.tasks, data.reminders), [data.reminders, data.tasks]);
  const due = useMemo(
    () =>
      [
        ...dueStandaloneReminders.map((reminder) => ({
          id: `reminder-${reminder.id}`,
          source: "reminder" as const,
          reminderId: reminder.id,
          taskId: reminder.task_id,
          title: reminder.title,
          at: reminder.remind_at,
          detail: reminder.task_id ? "task reminder" : "standalone reminder"
        })),
        ...dueTaskReminderRows.map((task) => ({
          id: `task-${task.id}`,
          source: "task" as const,
          taskId: task.id,
          title: task.title,
          at: task.reminder_at ?? task.updated_at,
          detail: "task reminder"
        }))
      ]
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
        .slice(0, 5),
    [dueStandaloneReminders, dueTaskReminderRows]
  );

  if (!user) return null;
  const userId = user.id;

  async function snoozeDueItem(item: (typeof due)[number], preset: SnoozePreset) {
    const nextReminderAt = snoozeReminderAt(preset);
    setSnoozingId(item.id);
    setReminderError(null);

    try {
      if (item.source === "reminder") {
        const { error: reminderUpdateError } = await getSupabase()
          .from("reminders")
          .update({ remind_at: nextReminderAt, status: "scheduled", sent_at: null })
          .eq("id", item.reminderId)
          .eq("user_id", userId);
        if (reminderUpdateError) throw new Error(reminderUpdateError.message);

        if (item.taskId) {
          const { error: taskUpdateError } = await getSupabase()
            .from("tasks")
            .update({ reminder_at: nextReminderAt, reminder_sent_at: null })
            .eq("id", item.taskId)
            .eq("user_id", userId);
          if (taskUpdateError) throw new Error(taskUpdateError.message);
        }
      } else {
        const { error: taskUpdateError } = await getSupabase()
          .from("tasks")
          .update({ reminder_at: nextReminderAt, reminder_sent_at: null })
          .eq("id", item.taskId)
          .eq("user_id", userId);
        if (taskUpdateError) throw new Error(taskUpdateError.message);
      }

      await refresh();
    } catch (snoozeError) {
      setReminderError(snoozeError instanceof Error ? snoozeError.message : "Reminder could not be snoozed.");
    } finally {
      setSnoozingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Today" subtitle="Plan, log, and capture the day from one place.">
        <ButtonLink href="/inbox" size="sm">
          <Inbox size={15} aria-hidden="true" />
          Inbox
        </ButtonLink>
        <ButtonLink href="/plan" size="sm">
          <ClipboardList size={15} aria-hidden="true" />
          Plan
        </ButtonLink>
        <ButtonLink href="/review" size="sm">
          <ClipboardCheck size={15} aria-hidden="true" />
          Review
        </ButtonLink>
        <ButtonLink href="/command" size="sm">
          <CommandIcon size={15} aria-hidden="true" />
          Command
        </ButtonLink>
        <ButtonLink href="#quick-capture" variant="primary" size="sm">
          <Plus size={15} aria-hidden="true" />
          Capture
        </ButtonLink>
      </PageHeader>

      {loading ? <LoadingBlock /> : null}
      {error ? (
        <div className="rounded-tile border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      {syncMessage ? (
        <div className="rounded-tile border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-emerald-4" role="status">
          {syncMessage}
        </div>
      ) : null}

      {!loading ? (
        <div className="flex flex-col gap-4">
          <ModuleCard
            title="Daily brief"
            kicker="Highest-priority actions across tasks, reminders, health, food, money, and people."
            action={
              <ButtonLink href="/plan" variant="ghost" size="sm" aria-label="Open plan">
                <ClipboardList size={16} aria-hidden="true" />
              </ButtonLink>
            }
          >
            {brief.length ? <DailyBriefList items={brief} /> : <EmptyState>No pressing gaps found. Keep logging and reviewing daily.</EmptyState>}
          </ModuleCard>

          <div className="grid grid-cols-2 gap-3">
            <StatTile icon={<SquareCheckBig size={16} />} label="Open tasks" value={summary.openTaskCount} />
            <StatTile icon={<Bell size={16} />} label="Due reminders" value={summary.dueReminderCount} tone="urgent" />
            <StatTile icon={<Timer size={16} />} label="Focus today" value={formatFocusDuration(summary.todayFocusMinutes)} />
            <StatTile icon={<Utensils size={16} />} label="Meals planned" value={food.todayPlannedMeals} />
            <StatTile icon={<Users size={16} />} label="Follow-ups" value={people.dueFollowUps.length} />
            <StatTile icon={<CreditCard size={16} />} label="Today spend" value={formatMoney(summary.todaySpending)} />
            <StatTile icon={<Flame size={16} />} label="Goals active" value={summary.activeGoalCount} />
            <StatTile icon={<Scale size={16} />} label="Habits done" value={`${summary.completedHabitCount}/${summary.activeHabitCount}`} />
          </div>
          <OnboardingPanel data={data} />

          <div className="flex flex-col gap-4">
            {dashboardWidgets.has("attention") ? (
              <ModuleCard title="What needs attention" kicker={`${summary.todayTaskCount} due today, ${summary.overdueTaskCount} overdue`}>
                {todayTasks.length ? (
                  <div className="flex flex-col gap-1.5">
                    {todayTasks.map((task) => (
                      <ListRow
                        key={task.id}
                        title={task.title}
                        subtitle={task.due_at ? `Due ${formatShortDate(task.due_at)} ${formatTime(task.due_at)}` : "No due date"}
                        trailing={<Badge tone={task.priority === "high" ? "urgent" : "neutral"}>{task.priority}</Badge>}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState>No tasks due today. Add a task or use quick capture to save something for later.</EmptyState>
                )}
              </ModuleCard>
            ) : null}

            {dashboardWidgets.has("tasks") ? (
              <TaskManager userId={user.id} tasks={data.tasks} reminders={data.reminders} tags={data.tags} taggings={data.taggings} onChanged={refresh} compact />
            ) : null}

            {dashboardWidgets.has("library") ? (
              <div id="quick-capture">
                <LibraryPanel userId={user.id} captures={data.captures} attachments={data.attachments} tags={data.tags} taggings={data.taggings} onChanged={refresh} compact />
              </div>
            ) : null}

            {dashboardWidgets.has("reminders") ? (
              <ModuleCard title="Reminder queue" kicker="Scheduled items that are due now.">
                {reminderError ? (
                  <div className="mb-2 rounded-tile border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-urgent" role="alert">
                    {reminderError}
                  </div>
                ) : null}
                {due.length ? (
                  <div className="flex flex-col gap-2">
                    {due.map((reminder) => (
                      <div key={reminder.id} className="rounded-tile border border-hairline bg-surface p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-ink">{reminder.title}</p>
                            <p className="text-[12.5px] text-ink-muted">
                              {formatShortDate(reminder.at)} {formatTime(reminder.at)} · {reminder.detail}
                            </p>
                          </div>
                          <Badge tone="urgent">due</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Snooze ${reminder.title}`}>
                          {SNOOZE_PRESETS.map((preset) => (
                            <Button key={preset} variant="ghost" size="sm" disabled={snoozingId === reminder.id} onClick={() => void snoozeDueItem(reminder, preset)}>
                              {snoozingId === reminder.id ? <Loader2 size={14} aria-hidden="true" /> : null}
                              {snoozePresetLabel(preset)}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState>No reminders are due right now.</EmptyState>
                )}
              </ModuleCard>
            ) : null}

            {dashboardWidgets.has("upcoming") ? (
              <ModuleCard
                title="Upcoming"
                kicker="Next dated items from your calendar."
                action={
                  <ButtonLink href="/calendar" variant="ghost" size="sm" aria-label="Open calendar">
                    <CalendarDays size={16} aria-hidden="true" />
                  </ButtonLink>
                }
              >
                {upcomingEvents.length ? (
                  <div className="flex flex-col gap-1.5">
                    {upcomingEvents.map((event) => (
                      <ListRow
                        key={event.id}
                        href={event.href}
                        title={event.title}
                        subtitle={`${formatShortDate(event.at)} ${formatTime(event.at)} · ${event.detail}`}
                        trailing={<Badge>{event.kind}</Badge>}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState>No upcoming dated items.</EmptyState>
                )}
              </ModuleCard>
            ) : null}

            {dashboardWidgets.has("health") ? (
              <ModuleCard title="Health today" kicker={`${summary.todayWorkoutMinutes} workout minutes logged`}>
                <div className="flex flex-col gap-1.5">
                  <ListRow
                    title={`${summary.todayCalories} calories`}
                    subtitle={dailyCalorieTarget ? `${Math.round((summary.todayCalories / dailyCalorieTarget) * 100)}% of ${dailyCalorieTarget} target` : "Meals logged today"}
                    trailing={<Badge>food</Badge>}
                  />
                  <ListRow title={`${summary.todayWorkoutMinutes} minutes`} subtitle="Workout duration today" trailing={<Badge tone="success">active</Badge>} />
                  <ListRow title={formatSleepDuration(summary.todaySleepMinutes)} subtitle="Sleep logged for today" trailing={<Badge>sleep</Badge>} />
                </div>
              </ModuleCard>
            ) : null}

            {dashboardWidgets.has("review") ? (
              <ModuleCard
                title="Weekly review"
                kicker="Last 7 days, including today."
                action={
                  <ButtonLink href="/review" variant="ghost" size="sm" aria-label="Open review">
                    <ClipboardCheck size={16} aria-hidden="true" />
                  </ButtonLink>
                }
              >
                <div className="flex flex-col gap-1.5">
                  <ListRow title={`${week.completedTasks} tasks completed`} subtitle={`${week.capturesSaved} captures saved`} trailing={<Badge>focus</Badge>} />
                  <ListRow
                    title={`${week.workoutMinutes} workout minutes`}
                    subtitle={`${week.averageCalories} average logged calories`}
                    trailing={<Badge tone="success">{weeklyWorkoutTarget ? `${Math.round((week.workoutMinutes / weeklyWorkoutTarget) * 100)}%` : "health"}</Badge>}
                  />
                  <ListRow title={`${food.upcomingMealPlans.length} meals planned`} subtitle={`${food.neededGroceries.length} grocery items needed`} trailing={<Badge>food</Badge>} />
                  <ListRow title={`${people.dueFollowUps.length} people follow-ups`} subtitle={`${people.upcomingBirthdays.length} birthdays in 30 days`} trailing={<Badge>people</Badge>} />
                  <ListRow title={`${formatMoney(week.spending)} spent`} subtitle={`${week.expensesLogged} expenses logged`} trailing={<Badge>money</Badge>} />
                  <ListRow title={`${formatSleepDuration(week.sleepAverageMinutes)} avg sleep`} subtitle={`${week.sleepNights} nights logged`} trailing={<Badge>recovery</Badge>} />
                  <ListRow title={`${formatFocusDuration(week.focusMinutes)} focused`} subtitle={`${week.focusSessions} sessions logged`} trailing={<Badge>focus</Badge>} />
                  <ListRow
                    title={`${week.habitCheckIns} habit check-ins`}
                    subtitle={`${week.journalEntries} journal entries · Mood: ${summary.sevenDayMood ?? "none"}`}
                    trailing={<Badge tone="warning">review</Badge>}
                  />
                </div>
              </ModuleCard>
            ) : null}

            {dashboardWidgets.has("insights") ? (
              <ModuleCard
                title="Insights"
                kicker="Trends across health, money, habits, goals, and mood."
                action={
                  <ButtonLink href="/insights" variant="ghost" size="sm" aria-label="Open insights">
                    <BarChart3 size={16} aria-hidden="true" />
                  </ButtonLink>
                }
              >
                <div className="flex flex-col gap-1.5">
                  <ListRow title={`${insights.workoutMinutes} workout minutes`} subtitle={`${insights.averageCalories} avg daily calories`} trailing={<Badge tone="success">7d</Badge>} />
                  <ListRow
                    title={`${formatMoney(finance.monthSpend)} this month`}
                    subtitle={`${finance.upcomingBills.length + finance.overdueBills.length} bill${finance.upcomingBills.length + finance.overdueBills.length === 1 ? "" : "s"} due soon`}
                    trailing={<Badge>money</Badge>}
                  />
                  <ListRow title={`${insights.goalProgressAverage}% goal progress`} subtitle={`${insights.habitCompletionRate}% habits complete now`} trailing={<Badge>trend</Badge>} />
                </div>
              </ModuleCard>
            ) : null}

            {dashboardWidgets.has("goals") ? <GoalsPanel userId={user.id} goals={data.goals} milestones={data.goalMilestones} onChanged={refresh} compact /> : null}

            {dashboardWidgets.has("health") ? (
              <HealthPanel
                userId={user.id}
                meals={data.meals}
                weightLogs={data.weightLogs}
                workouts={data.workouts}
                sleepLogs={data.sleepLogs}
                tags={data.tags}
                taggings={data.taggings}
                preferredWeightUnit={data.profile?.weight_unit ?? "kg"}
                dailyCalorieTarget={dailyCalorieTarget}
                dailyProteinTarget={data.profile?.daily_protein_target ?? null}
                dailyCarbsTarget={data.profile?.daily_carbs_target ?? null}
                dailyFatTarget={data.profile?.daily_fat_target ?? null}
                weeklyWorkoutTarget={weeklyWorkoutTarget}
                onChanged={refresh}
                compact
              />
            ) : null}

            {dashboardWidgets.has("food") ? (
              <FoodPanel userId={user.id} mealPlans={data.mealPlans} groceryItems={data.groceryItems} tags={data.tags} taggings={data.taggings} onChanged={refresh} compact />
            ) : null}

            {dashboardWidgets.has("finance") ? (
              <FinancePanel userId={user.id} expenses={data.expenses} bills={data.bills} tags={data.tags} taggings={data.taggings} onChanged={refresh} compact />
            ) : null}

            {dashboardWidgets.has("people") ? <PeoplePanel userId={user.id} people={data.people} onChanged={refresh} compact /> : null}

            {dashboardWidgets.has("focus") ? (
              <FocusPanel userId={user.id} sessions={data.focusSessions} tasks={data.tasks} tags={data.tags} taggings={data.taggings} onChanged={refresh} compact />
            ) : null}

            {dashboardWidgets.has("habits") ? <HabitsPanel userId={user.id} habits={data.habits} habitLogs={data.habitLogs} onChanged={refresh} compact /> : null}

            {dashboardWidgets.has("journal") ? <JournalPanel userId={user.id} entries={data.journalEntries} onChanged={refresh} compact /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DailyBriefList({ items }: { items: DailyBriefItem[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <ListRow
          key={item.id}
          href={item.href}
          title={item.title}
          subtitle={item.detail}
          trailing={
            <div className="flex items-center gap-2">
              <Badge tone={briefTone(item.tone)}>{item.label}</Badge>
              <ArrowRight size={16} className="text-ink-muted" aria-hidden="true" />
            </div>
          }
        />
      ))}
    </div>
  );
}

function briefTone(tone: DailyBriefItem["tone"]): BadgeTone {
  if (tone === "danger") return "urgent";
  if (tone === "warning") return "warning";
  if (tone === "success") return "success";
  return "neutral";
}
