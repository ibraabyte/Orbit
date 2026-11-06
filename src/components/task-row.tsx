import { router } from "expo-router";
import { useMemo } from "react";
import { Badge, CheckItem, ListRow, MoreButton } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useTaskActions } from "@/hooks/use-task-actions";
import { isToday } from "@/lib/dates";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import { repeatGlyph, stepProgress } from "@/lib/tasks";
import type { Task } from "@/lib/types";

const when = (iso: string) => formatDate(iso, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const clock = (iso: string) => formatDate(iso, { hour: "numeric", minute: "2-digit" });

// A task with a check circle, its day, list, repeat and checklist count. Tap opens the task; ⋯ has the quick actions.
// Today and Tasks share it. In Tasks the day is the group's title (grouped), so there is no day badge, and today's and
// tomorrow's rows show only the time (timeOnly).
export function TaskRow({ task, showPriority, showList, grouped, timeOnly, first }: { task: Task; showPriority?: boolean; showList?: boolean; grouped?: boolean; timeOnly?: boolean; first?: boolean }) {
  const { data } = useDashboardData();
  const { sheet } = useOverlays();
  const actions = useTaskActions();
  const overdue = Boolean(task.due_at && new Date(task.due_at).getTime() < Date.now());
  const today = isToday(task.due_at);
  const steps = useMemo(() => stepProgress(data.taskSteps.filter((step) => step.task_id === task.id)), [data.taskSteps, task.id]);
  const listName = showList && task.list_id ? data.taskLists.find((list) => list.id === task.list_id)?.name : undefined;
  const open = () => router.push({ pathname: "/task/[id]", params: { id: task.id } });

  const more = () =>
    sheet({
      title: task.title,
      detail: task.due_at ? when(task.due_at) : t.noDate,
      options: [
        { label: `✓ ${t.complete}`, run: () => void actions.complete(task) },
        { label: `◷ ${t.snoozeTo}`, run: () => actions.snooze(task) },
        { label: `✎ ${t.edit}`, run: open },
        { label: `✕ ${t.deleteTask}`, run: () => actions.remove(task), destructive: true }
      ]
    });

  const subtitle = task.due_at ? (timeOnly ? clock(task.due_at) : when(task.due_at)) : null;
  const dayBadge = grouped ? null : overdue ? (
    <Badge tone="urgent" glyph="!">
      {t.overdue}
    </Badge>
  ) : today ? (
    <Badge tone="accent" glyph="◷">
      {t.dueToday}
    </Badge>
  ) : (
    <Badge glyph="○">{task.due_at ? t.upcoming : t.noDate}</Badge>
  );

  return (
    <ListRow
      first={first}
      onPress={open}
      leading={<CheckItem checked={false} label={`${t.complete}: ${task.title}`} onPress={() => void actions.complete(task)} />}
      title={task.title}
      subtitle={subtitle}
      badges={
        <>
          {dayBadge}
          {showPriority && task.priority !== "normal" ? (
            <Badge tone={task.priority === "high" ? "urgent" : "neutral"} glyph={task.priority === "high" ? "↑" : "↓"}>
              {task.priority === "high" ? t.high : t.low}
            </Badge>
          ) : null}
          {listName ? <Badge glyph="▤">{listName}</Badge> : null}
          {task.recurrence ? <Badge glyph={repeatGlyph}>{t.recurrenceNames[task.recurrence]}</Badge> : null}
          {steps.total ? <Badge tone={steps.done === steps.total ? "success" : "neutral"} glyph="☑">{`${formatNumber(steps.done)}/${formatNumber(steps.total)}`}</Badge> : null}
        </>
      }
      trailing={<MoreButton onPress={more} label={`${t.edit}: ${task.title}`} />}
    />
  );
}
