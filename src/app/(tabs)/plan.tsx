import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Badge, Card, EmptyState, ListRow, RingGauge, Stack, StatGrid, StatTile, toneToBadge, type, type BadgeTone, type IconName, type StatTone } from "@/components/drift";
import { Screen, Segments, ui } from "@/components/screen";
import { colors, fonts } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { appHref } from "@/lib/app-href";
import { buildCalendarDays } from "@/lib/calendar";
import { formatShortDate, formatTime } from "@/lib/dates";
import { formatMoney } from "@/lib/finance";
import { formatFocusDuration } from "@/lib/focus";
import { insightSummary } from "@/lib/insights";
import { buildPlanAgenda, buildWeeklyPlan, type PlanAgendaLoad } from "@/lib/planning";
import { buildReviewSummary, type ReviewMode } from "@/lib/review";
import { formatSleepDuration } from "@/lib/sleep";

const views = ["Week", "Review", "Trends"] as const;
const reviewModes: ReviewMode[] = ["morning", "evening", "weekly"];
type Tone = "danger" | "warning" | "success" | undefined;

// The web's Plan, Review and Insights pages, as one tab with three views.
export default function Plan() {
  const { data, loading, refresh } = useDashboardData();
  const [view, setView] = useState<(typeof views)[number]>("Week");
  const [mode, setMode] = useState<ReviewMode>(new Date().getHours() < 12 ? "morning" : "evening");
  const plan = useMemo(() => buildWeeklyPlan(data), [data]);
  const currency = data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR";
  const money = (amount: number) => formatMoney(amount, currency);

  return (
    <Screen title="Plan" subtitle={`Shape the week from ${plan.weekStart} to ${plan.weekEnd}.`} refreshing={loading} onRefresh={refresh}>
      <Segments options={views} value={view} onChange={setView} />
      {view === "Week" ? <Week /> : null}
      {view === "Review" ? <Review /> : null}
      {view === "Trends" ? <Trends /> : null}
    </Screen>
  );

  function Week() {
    const agenda = buildPlanAgenda(data);
    const upcoming = buildCalendarDays(data, 7)
      .flatMap((day) => day.events)
      .slice(0, 8);
    return (
      <>
        <StatGrid>
          <PlanTile icon="check-square" label="Due this week" value={plan.taskLoad.dueThisWeek} detail={`${plan.taskLoad.overdue} overdue`} tone={plan.taskLoad.overdue ? "danger" : undefined} />
          <PlanTile icon="clock" label="Focus" value={formatFocusDuration(plan.focusTargets.weekMinutes)} detail={`${plan.focusTargets.plannedThisWeek} planned`} tone={plan.focusTargets.overduePlanned ? "warning" : undefined} />
          <PlanTile icon="activity" label="Training left" value={`${plan.healthTargets.workoutRemaining}m`} detail={`${plan.healthTargets.workoutMinutes}/${plan.healthTargets.workoutTarget} min`} tone={plan.healthTargets.workoutRemaining ? "warning" : "success"} />
          <PlanTile icon="coffee" label="Meals planned" value={plan.foodTargets.plannedThisWeek} detail={`${plan.foodTargets.todayPlannedMeals} today`} tone={plan.foodTargets.overdueMealPlans ? "warning" : undefined} />
          <PlanTile icon="shopping-bag" label="Groceries" value={plan.foodTargets.groceriesNeeded} detail={`${plan.foodTargets.groceriesDue} due soon`} tone={plan.foodTargets.groceriesDue ? "warning" : undefined} />
          <PlanTile icon="users" label="People" value={plan.peopleTargets.dueFollowUps} detail={`${plan.peopleTargets.upcomingBirthdays} birthdays`} tone={plan.peopleTargets.overdueFollowUps ? "warning" : undefined} />
          <PlanTile icon="moon" label="Avg sleep" value={formatSleepDuration(plan.healthTargets.sleepAverageMinutes)} detail={`${plan.healthTargets.sleepNights} nights logged`} tone={plan.healthTargets.sleepNights < 3 ? "warning" : undefined} />
          <PlanTile
            icon="credit-card"
            label="Bills due"
            value={plan.financeTargets.billsDueThisWeek + plan.financeTargets.overdueBills}
            detail={`${money(plan.financeTargets.weekSpend)} spent`}
            tone={plan.financeTargets.overdueBills ? "danger" : plan.financeTargets.billsDueThisWeek ? "warning" : undefined}
          />
          <PlanTile icon="repeat" label="Habits behind" value={plan.habitTargets.behind} detail={`${plan.habitTargets.complete}/${plan.habitTargets.active} complete`} tone={plan.habitTargets.behind ? "warning" : "success"} />
          <PlanTile icon="flag" label="Goal deadlines" value={plan.goalTargets.dueThisWeek} detail={`${plan.goalTargets.averageProgress}% avg progress`} tone={plan.goalTargets.dueThisWeek ? "warning" : undefined} />
        </StatGrid>

        <Card title="Week execution map" kicker="A day-by-day view of where the plan actually lands.">
          <Stack gap={8}>
            {agenda.map((day) => (
              <View key={day.date} style={ui.tile} accessibilityLabel={`${day.label}: ${day.summary}`}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={type.rowTitle}>{day.label}</Text>
                    <Text style={type.rowSubtitle}>{day.summary}</Text>
                  </View>
                  <Badge tone={agendaTone(day.load)}>{day.load}</Badge>
                </View>
                {day.events.length ? (
                  <View style={{ gap: 6, marginTop: 6 }}>
                    {day.events.map((event) => (
                      <View key={event.id} style={{ gap: 1 }}>
                        <Text style={[type.rowTitle, { fontSize: 13 }]}>{event.title}</Text>
                        <Text style={type.rowMeta}>
                          {formatTime(event.at)} · {event.detail}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[type.rowSubtitle, { marginTop: 6 }]}>Keep this as buffer or schedule the next important block.</Text>
                )}
                {day.hiddenCount ? <Text style={[type.rowMeta, { marginTop: 6, color: colors.accentDeep, fontFamily: fonts.semibold }]}>+{day.hiddenCount} more</Text> : null}
              </View>
            ))}
          </Stack>
        </Card>

        <Card title="Recommended actions" kicker="Highest-leverage moves from your current data.">
          {plan.actions.length ? (
            <Stack>
              {plan.actions.map((action) => (
                <ListRow key={action.id} href={appHref(action.href)} title={action.title} subtitle={action.detail} trailing={<Badge tone={toneToBadge(action.tone)}>{action.tone === "neutral" ? "plan" : action.tone}</Badge>} />
              ))}
            </Stack>
          ) : (
            <EmptyState>No planning actions found.</EmptyState>
          )}
        </Card>

        <Card title="Next scheduled items" kicker="The next 7 days across Orbit.">
          {upcoming.length ? (
            <Stack>
              {upcoming.map((event) => (
                <ListRow key={event.id} href={appHref(event.href)} title={event.title} subtitle={`${formatShortDate(event.at)} ${formatTime(event.at)} · ${event.detail}`} trailing={<Badge tone={eventKindTone(event.kind)}>{event.kind}</Badge>} />
              ))}
            </Stack>
          ) : (
            <EmptyState>No dated work, logs, or goals in the next week.</EmptyState>
          )}
        </Card>

        <Card title="Workload" kicker={`${plan.taskLoad.highPriority} high-priority open task${plan.taskLoad.highPriority === 1 ? "" : "s"}.`}>
          <Stack>
            <PlanMetric label="Overdue tasks" value={plan.taskLoad.overdue} tone={plan.taskLoad.overdue ? "danger" : "success"} />
            <PlanMetric label="Due this week" value={plan.taskLoad.dueThisWeek} />
            <PlanMetric label="High priority" value={plan.taskLoad.highPriority} tone={plan.taskLoad.highPriority ? "warning" : undefined} />
          </Stack>
        </Card>

        <Card title="Health targets" kicker="Compared with your saved preferences.">
          <Stack>
            <PlanMetric label="Average calories" value={plan.healthTargets.calorieAverage} detail={calorieDetail(plan.healthTargets.caloriesTarget, plan.healthTargets.calorieDelta)} />
            <PlanMetric label="Workout minutes" value={`${plan.healthTargets.workoutMinutes}/${plan.healthTargets.workoutTarget}`} tone={plan.healthTargets.workoutRemaining ? "warning" : "success"} />
            <PlanMetric label="Average sleep" value={formatSleepDuration(plan.healthTargets.sleepAverageMinutes)} detail={`${plan.healthTargets.sleepNights} nights logged`} tone={plan.healthTargets.sleepNights < 3 ? "warning" : undefined} />
          </Stack>
        </Card>

        <Card title="Money plan" kicker="Spending and active bill pressure.">
          <Stack>
            <PlanMetric label="Spent this week" value={money(plan.financeTargets.weekSpend)} detail={`${plan.financeTargets.expensesLogged} expenses logged`} />
            <PlanMetric label="Bills due" value={plan.financeTargets.billsDueThisWeek + plan.financeTargets.overdueBills} tone={plan.financeTargets.overdueBills ? "danger" : plan.financeTargets.billsDueThisWeek ? "warning" : undefined} />
            <PlanMetric label="Monthly commitments" value={money(plan.financeTargets.monthlyCommitments)} />
          </Stack>
        </Card>

        <Card title="Review coverage" kicker="Signals that make planning better.">
          <Stack>
            <PlanMetric label="Captures saved" value={plan.review.capturesSaved} />
            <PlanMetric label="Journal entries" value={plan.review.journalEntries} tone={plan.review.journalEntries < 3 ? "warning" : "success"} />
            <PlanMetric label="Average mood" value={plan.review.averageMood ?? "none"} />
          </Stack>
        </Card>
      </>
    );
  }

  function Review() {
    const review = buildReviewSummary(data, mode);
    return (
      <>
        <Segments options={reviewModes} value={mode} onChange={setMode} />
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <RingGauge value={review.score / 100} label={`${review.score}%`} sublabel="Ready" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.h2}>{review.scoreLabel}</Text>
              <Text style={type.meta}>Close the loop for {formatShortDate(review.date)} with the data already in Orbit.</Text>
            </View>
          </View>
        </Card>
        <StatGrid>
          {review.metrics.map((metric) => (
            <StatTile key={metric.label} label={metric.label} value={metric.value} hint={metric.detail} tone={statTone(metric.tone)} />
          ))}
        </StatGrid>
        <Card title="Review actions" kicker={`${review.score}% readiness · ${review.scoreLabel}`}>
          <Stack>
            {review.actions.map((action) => (
              <ListRow key={action.id} href={appHref(action.href)} title={action.title} subtitle={action.detail} trailing={<Badge tone={toneToBadge(action.tone)}>{action.tone === "neutral" ? "next" : action.tone}</Badge>} />
            ))}
          </Stack>
        </Card>
        <Card title="Tomorrow handoff" kicker={`${review.handoff.eventCount} item${review.handoff.eventCount === 1 ? "" : "s"} on ${review.handoff.label}`}>
          <ListRow
            href={appHref(review.handoff.firstMove.href)}
            title={review.handoff.firstMove.title}
            subtitle={review.handoff.firstMove.detail}
            trailing={<Badge tone="accent">first move</Badge>}
          />
        </Card>
        <Card title="Highlights" kicker="Signals that went well.">
          <Lines lines={review.highlights} badge="good" tone="success" empty="Nothing logged yet today." />
        </Card>
        <Card title="Gaps" kicker="Items worth closing or explaining.">
          <Lines lines={review.gaps} badge="gap" tone="warning" empty="No gaps. Nice." />
        </Card>
        <Card title="Reflection prompts" kicker="Questions for a useful journal note.">
          <Lines lines={review.prompts} badge="prompt" tone="neutral" empty="No prompts." />
        </Card>
      </>
    );
  }

  function Trends() {
    const insights = insightSummary(data);
    return (
      <>
        <StatGrid>
          <StatTile icon="coffee" label="Calorie avg" value={insights.averageCalories} />
          <StatTile icon="activity" label="Workout 7d" value={`${insights.workoutMinutes}m`} />
          <StatTile icon="repeat" label="Habits" value={`${insights.habitCompletionRate}%`} tone="accent" />
          <StatTile icon="flag" label="Goals" value={`${insights.goalProgressAverage}%`} tone="accent" />
          <StatTile icon="smile" label="Mood 7d" value={insights.sevenDayMood || "-"} />
          <StatTile icon="moon" label="Sleep avg" value={formatSleepDuration(insights.sleep.sevenDayAverageMinutes)} />
          <StatTile icon="clock" label="Focus 7d" value={formatFocusDuration(insights.focus.weekMinutes)} />
          <StatTile icon="trending-down" label="Weight" value={insights.weight.latest === null ? "-" : `${insights.weight.latest} ${insights.weight.unit}`} />
        </StatGrid>
      </>
    );
  }
}

function PlanTile({ icon, label, value, detail, tone }: { icon: IconName; label: string; value: string | number; detail: string; tone?: Tone }) {
  return <StatTile icon={icon} label={label} value={value} hint={detail} tone={statTone(tone)} />;
}

// The web's PlanMetric: the number is the row title and the label rides in the badge.
function PlanMetric({ label, value, detail, tone }: { label: string; value: string | number; detail?: string; tone?: Tone }) {
  return <ListRow title={String(value)} subtitle={detail ?? label} trailing={<Badge tone={toneToBadge(tone)}>{label}</Badge>} />;
}

function Lines({ lines, badge, tone, empty }: { lines: string[]; badge: string; tone: "success" | "warning" | "neutral"; empty: string }) {
  if (!lines.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <Stack>
      {lines.map((line) => (
        <ListRow key={line} title={line} trailing={<Badge tone={tone}>{badge}</Badge>} />
      ))}
    </Stack>
  );
}

function statTone(tone?: Tone): StatTone {
  if (tone === "danger" || tone === "warning") return "urgent";
  if (tone === "success") return "success";
  return "neutral";
}

function agendaTone(load: PlanAgendaLoad): BadgeTone {
  if (load === "heavy") return "urgent";
  if (load === "full") return "warning";
  if (load === "light") return "success";
  return "neutral";
}

function eventKindTone(kind: string): BadgeTone {
  if (kind === "reminder" || kind === "bill" || kind === "grocery" || kind === "person") return "warning";
  if (kind === "workout" || kind === "focus" || kind === "mealPlan") return "success";
  return "neutral";
}

function calorieDetail(target: number | null, delta: number | null) {
  if (target === null || delta === null) return "No daily target set";
  if (delta === 0) return `On ${target} target`;
  return `${Math.abs(delta)} ${delta > 0 ? "above" : "below"} ${target} target`;
}
