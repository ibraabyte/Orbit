import { useMemo } from "react";
import { Text, View } from "react-native";
import { Badge, Card, CardAction, CheckItem, EmptyState, Icon, ListRow, PillLink, Stack, StatGrid, StatTile, toneToBadge, type } from "@/components/drift";
import { QuickAddBar } from "@/components/quick-add-bar";
import { Screen, ui } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { usePrayerTimes } from "@/hooks/use-prayer-times";
import { apiCompleteTask } from "@/lib/api-actions";
import { appHref } from "@/lib/app-href";
import { getApi } from "@/lib/backend";
import { buildCalendarDays } from "@/lib/calendar";
import { buildDailyBrief, overdueTasks, summarizeDashboard, todaysTasks, weeklySummary } from "@/lib/dashboard";
import { dashboardWidgetSet } from "@/lib/dashboard-widgets";
import { formatShortDate, formatTime } from "@/lib/dates";
import { financeSummary, formatMoney } from "@/lib/finance";
import { formatFocusDuration } from "@/lib/focus";
import { foodSummary } from "@/lib/food";
import { insightSummary } from "@/lib/insights";
import { peopleSummary } from "@/lib/people";
import { formatSleepDuration } from "@/lib/sleep";

// The web version's Today: daily brief, stat tiles, then one card per area.
export default function Today() {
  const { data, loading, error, refresh, act } = useDashboardData();
  const { next: prayer } = usePrayerTimes();
  const summary = useMemo(() => summarizeDashboard(data), [data]);
  const brief = useMemo(() => buildDailyBrief(data), [data]);
  const week = useMemo(() => weeklySummary(data), [data]);
  const insights = useMemo(() => insightSummary(data), [data]);
  const finance = useMemo(() => financeSummary(data), [data]);
  const food = useMemo(() => foodSummary(data), [data]);
  const people = useMemo(() => peopleSummary(data), [data]);
  const widgets = useMemo(() => dashboardWidgetSet(data.profile?.dashboard_modules), [data.profile?.dashboard_modules]);
  const upcoming = useMemo(() => buildCalendarDays(data, 7).flatMap((day) => day.events).slice(0, 4), [data]);
  const attention = useMemo(() => {
    const seen = new Set<string>();
    return [...overdueTasks(data.tasks), ...todaysTasks(data.tasks)].filter((task) => !seen.has(task.id) && seen.add(task.id)).slice(0, 6);
  }, [data.tasks]);
  const currency = data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR";
  const money = (amount: number) => formatMoney(amount, currency);
  const calorieTarget = data.profile?.daily_calorie_target ?? null;
  const workoutTarget = data.profile?.weekly_workout_minutes_target ?? 150;
  const now = Date.now();

  return (
    <Screen
      title="Today"
      subtitle="Plan, log, and capture the day from one place."
      refreshing={loading}
      onRefresh={refresh}
      actions={
        <>
          <PillLink href="/tasks" icon="check-square" label="Tasks" />
          <PillLink href="/plan" icon="clipboard" label="Plan" />
          <PillLink href="/capture" icon="plus" label="Capture" primary />
        </>
      }
    >
      {error ? (
        <View style={[ui.tile, { flexDirection: "row", gap: 8, alignItems: "center" }]} accessibilityRole="alert">
          <Icon name="alert-circle" size={15} color={colors.urgent} />
          <Text style={[type.rowTitle, { flex: 1, color: colors.urgent }]}>{error}</Text>
        </View>
      ) : null}

      {prayer ? (
        <ListRow
          leading={<Icon name="sunrise" size={18} color={colors.accentDeep} />}
          title={`صلاة ${prayer.label}`}
          meta={prayer.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        />
      ) : null}

      <Card title="Daily brief" kicker="Highest-priority actions across tasks, reminders, health, food, money, and people." action={<CardAction icon="clipboard" href="/plan" label="Open plan" />}>
        {brief.length ? (
          <Stack>
            {brief.map((item) => (
              <ListRow
                key={item.id}
                href={appHref(item.href)}
                title={item.title}
                subtitle={item.detail}
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Badge tone={toneToBadge(item.tone)}>{item.label}</Badge>
                    <Icon name="arrow-right" size={16} />
                  </View>
                }
              />
            ))}
          </Stack>
        ) : (
          <EmptyState>No pressing gaps found. Keep logging and reviewing daily.</EmptyState>
        )}
      </Card>

      <StatGrid>
        <StatTile icon="check-square" label="Open tasks" value={summary.openTaskCount} />
        <StatTile icon="bell" label="Due reminders" value={summary.dueReminderCount} tone="urgent" />
        <StatTile icon="clock" label="Focus today" value={formatFocusDuration(summary.todayFocusMinutes)} />
        <StatTile icon="coffee" label="Meals planned" value={food.todayPlannedMeals} />
        <StatTile icon="users" label="Follow-ups" value={people.dueFollowUps.length} />
        <StatTile icon="credit-card" label="Today spend" value={money(summary.todaySpending)} />
        <StatTile icon="flag" label="Goals active" value={summary.activeGoalCount} />
        <StatTile icon="repeat" label="Habits done" value={`${summary.completedHabitCount}/${summary.activeHabitCount}`} />
      </StatGrid>

      {widgets.has("attention") ? (
        <Card title="What needs attention" kicker={`${summary.todayTaskCount} due today, ${summary.overdueTaskCount} overdue`} action={<CardAction icon="check-square" href="/tasks" label="Open tasks" />}>
          {attention.length ? (
            <Stack>
              {attention.map((task) => {
                const overdue = Boolean(task.due_at && new Date(task.due_at).getTime() < now);
                return (
                  <ListRow
                    key={task.id}
                    leading={<CheckItem checked={false} label={`Mark ${task.title} done`} onPress={() => act(() => apiCompleteTask(getApi(), task.id))} />}
                    title={task.title}
                    subtitle={task.due_at ? `Due ${formatShortDate(task.due_at)} ${formatTime(task.due_at)}` : "No due date"}
                    trailing={<Badge tone={overdue || task.priority === "high" ? "urgent" : "neutral"}>{overdue ? "overdue" : task.priority}</Badge>}
                  />
                );
              })}
            </Stack>
          ) : (
            <EmptyState>No tasks due today. Add a task or use quick capture to save something for later.</EmptyState>
          )}
        </Card>
      ) : null}

      {widgets.has("library") || widgets.has("tasks") ? (
        <Card title="Quick capture" kicker="One line in, any record out. English or Arabic.">
          <QuickAddBar />
        </Card>
      ) : null}

      {widgets.has("upcoming") ? (
        <Card title="Upcoming" kicker="Next dated items from your calendar." action={<CardAction icon="calendar" href="/plan" label="Open plan" />}>
          {upcoming.length ? (
            <Stack>
              {upcoming.map((event) => (
                <ListRow key={event.id} href={appHref(event.href)} title={event.title} subtitle={`${formatShortDate(event.at)} ${formatTime(event.at)} · ${event.detail}`} trailing={<Badge>{event.kind}</Badge>} />
              ))}
            </Stack>
          ) : (
            <EmptyState>No upcoming dated items.</EmptyState>
          )}
        </Card>
      ) : null}

      {widgets.has("health") ? (
        <Card title="Health today" kicker={`${summary.todayWorkoutMinutes} workout minutes logged`} action={<CardAction icon="activity" href="/health" label="Open health" />}>
          <Stack>
            <ListRow
              title={`${summary.todayCalories} calories`}
              subtitle={calorieTarget ? `${Math.round((summary.todayCalories / calorieTarget) * 100)}% of ${calorieTarget} target` : "Meals logged today"}
              trailing={<Badge>food</Badge>}
            />
            <ListRow title={`${summary.todayWorkoutMinutes} minutes`} subtitle="Workout duration today" trailing={<Badge tone="success">active</Badge>} />
            <ListRow title={formatSleepDuration(summary.todaySleepMinutes)} subtitle="Sleep logged for today" trailing={<Badge>sleep</Badge>} />
          </Stack>
        </Card>
      ) : null}

      {widgets.has("review") ? (
        <Card title="Weekly review" kicker="Last 7 days, including today." action={<CardAction icon="check-circle" href="/plan" label="Open review" />}>
          <Stack>
            <ListRow title={`${week.completedTasks} tasks completed`} subtitle={`${week.capturesSaved} captures saved`} trailing={<Badge>focus</Badge>} />
            <ListRow
              title={`${week.workoutMinutes} workout minutes`}
              subtitle={`${week.averageCalories} average logged calories`}
              trailing={<Badge tone="success">{workoutTarget ? `${Math.round((week.workoutMinutes / workoutTarget) * 100)}%` : "health"}</Badge>}
            />
            <ListRow title={`${food.upcomingMealPlans.length} meals planned`} subtitle={`${food.neededGroceries.length} grocery items needed`} trailing={<Badge>food</Badge>} />
            <ListRow title={`${people.dueFollowUps.length} people follow-ups`} subtitle={`${people.upcomingBirthdays.length} birthdays in 30 days`} trailing={<Badge>people</Badge>} />
            <ListRow title={`${money(week.spending)} spent`} subtitle={`${week.expensesLogged} expenses logged`} trailing={<Badge>money</Badge>} />
            <ListRow title={`${formatSleepDuration(week.sleepAverageMinutes)} avg sleep`} subtitle={`${week.sleepNights} nights logged`} trailing={<Badge>recovery</Badge>} />
            <ListRow title={`${formatFocusDuration(week.focusMinutes)} focused`} subtitle={`${week.focusSessions} sessions logged`} trailing={<Badge>focus</Badge>} />
            <ListRow
              title={`${week.habitCheckIns} habit check-ins`}
              subtitle={`${week.journalEntries} journal entries · Mood: ${summary.sevenDayMood ?? "none"}`}
              trailing={<Badge tone="warning">review</Badge>}
            />
          </Stack>
        </Card>
      ) : null}

      {widgets.has("insights") ? (
        <Card title="Insights" kicker="Trends across health, money, habits, goals, and mood." action={<CardAction icon="bar-chart-2" href="/focus" label="Open momentum" />}>
          <Stack>
            <ListRow title={`${insights.workoutMinutes} workout minutes`} subtitle={`${insights.averageCalories} avg daily calories`} trailing={<Badge tone="success">7d</Badge>} />
            <ListRow
              title={`${money(finance.monthSpend)} this month`}
              subtitle={`${finance.upcomingBills.length + finance.overdueBills.length} bill${finance.upcomingBills.length + finance.overdueBills.length === 1 ? "" : "s"} due soon`}
              trailing={<Badge>money</Badge>}
            />
            <ListRow title={`${insights.goalProgressAverage}% goal progress`} subtitle={`${insights.habitCompletionRate}% habits complete now`} trailing={<Badge>trend</Badge>} />
          </Stack>
        </Card>
      ) : null}
    </Screen>
  );
}
