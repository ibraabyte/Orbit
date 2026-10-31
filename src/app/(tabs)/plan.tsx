import { useState } from "react";
import { Text, View } from "react-native";
import { Row, Screen, Section, Segments, shell, Stats, ui } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { appHref } from "@/lib/app-href";
import { formatFocusDuration } from "@/lib/focus";
import { insightSummary } from "@/lib/insights";
import { buildPlanAgenda, buildWeeklyPlan } from "@/lib/planning";
import { buildReviewSummary, type ReviewMode } from "@/lib/review";
import { formatSleepDuration } from "@/lib/sleep";

const views = ["Week", "Review", "Trends"] as const;
const reviewModes: ReviewMode[] = ["morning", "evening", "weekly"];

// Plan, Review and Insights were three web pages reading the same week; here they are one tab.
export default function Plan() {
  const { data, loading, refresh } = useDashboardData();
  const [view, setView] = useState<(typeof views)[number]>("Week");
  const [mode, setMode] = useState<ReviewMode>(new Date().getHours() < 12 ? "morning" : "evening");

  return (
    <Screen title="Plan" refreshing={loading} onRefresh={refresh}>
      <Segments options={views} value={view} onChange={setView} />
      {view === "Week" ? <Week /> : null}
      {view === "Review" ? (
        <>
          <Segments options={reviewModes} value={mode} onChange={setMode} />
          <Review mode={mode} />
        </>
      ) : null}
      {view === "Trends" ? <Trends /> : null}
    </Screen>
  );

  function Week() {
    const plan = buildWeeklyPlan(data);
    const agenda = buildPlanAgenda(data);
    return (
      <>
        <Stats
          items={[
            ["Overdue", plan.taskLoad.overdue],
            ["Due this week", plan.taskLoad.dueThisWeek],
            ["High priority", plan.taskLoad.highPriority],
            ["Workout left", `${plan.healthTargets.workoutRemaining}m`],
            ["Sleep avg", formatSleepDuration(plan.healthTargets.sleepAverageMinutes)],
            ["Calorie avg", plan.healthTargets.calorieAverage]
          ]}
        />
        <Section title="Actions">
          {plan.actions.map((action) => (
            <Row key={action.id} title={action.title} detail={action.detail} tone={action.tone} href={appHref(action.href)} />
          ))}
        </Section>
        <Section title="Next 7 days">
          {agenda.map((day) => (
            <View key={day.date} style={ui.card}>
              <Text style={ui.strong}>
                {day.label} · <Text style={ui.muted}>{day.summary}</Text>
              </Text>
              {day.events.map((event) => (
                <Text key={event.id} style={ui.muted}>
                  {event.title} · {event.detail}
                </Text>
              ))}
              {day.hiddenCount ? <Text style={ui.muted}>+{day.hiddenCount} more</Text> : null}
            </View>
          ))}
        </Section>
      </>
    );
  }

  function Review({ mode }: { mode: ReviewMode }) {
    const review = buildReviewSummary(data, mode);
    return (
      <>
        <Stats items={[["Score", review.score], ...review.metrics.slice(0, 5).map((metric) => [metric.label, metric.value] as const)]} />
        <Text style={shell.muted}>Status: {review.scoreLabel}</Text>
        {review.highlights.length ? <Bullets title="Going well" lines={review.highlights} /> : null}
        {review.gaps.length ? <Bullets title="Gaps" lines={review.gaps} /> : null}
        <Section title="Actions">
          {review.actions.map((action) => (
            <Row key={action.id} title={action.title} detail={action.detail} tone={action.tone} href={appHref(action.href)} />
          ))}
        </Section>
        <Section title={`Tomorrow · ${review.handoff.label}`}>
          <Row title={review.handoff.firstMove.title} detail={review.handoff.firstMove.detail} tone={review.handoff.firstMove.tone} href={appHref(review.handoff.firstMove.href)} />
        </Section>
        <Bullets title="Reflect" lines={review.prompts} />
      </>
    );
  }

  function Trends() {
    const insights = insightSummary(data);
    return (
      <Stats
        items={[
          ["Calorie avg", insights.averageCalories],
          ["Workout 7d", `${insights.workoutMinutes}m`],
          ["Habits", `${insights.habitCompletionRate}%`],
          ["Goals", `${insights.goalProgressAverage}%`],
          ["Mood 7d", insights.sevenDayMood || "-"],
          ["Sleep avg", formatSleepDuration(insights.sleep.sevenDayAverageMinutes)],
          ["Focus 7d", formatFocusDuration(insights.focus.weekMinutes)],
          ["Weight", insights.weight.latest === null ? "-" : `${insights.weight.latest} ${insights.weight.unit}`]
        ]}
      />
    );
  }
}

function Bullets({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Section title={title}>
      <View style={ui.card}>{lines.length ? lines.map((line) => <Text key={line} style={ui.body}>• {line}</Text>) : <Text style={ui.muted}>Nothing yet.</Text>}</View>
    </Section>
  );
}
