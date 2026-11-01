import { Badge, CheckItem, ListRow, MoreButton } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiCompleteTask, apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { isToday } from "@/lib/dates";
import { formatDate, t } from "@/lib/i18n";
import type { Task } from "@/lib/types";

const when = (iso: string) => formatDate(iso, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// A task with its status, a check circle, and ⋯ for complete / +1h / reschedule. Today and Tasks share it.
export function TaskRow({ task, showPriority }: { task: Task; showPriority?: boolean }) {
  const { act } = useDashboardData();
  const { sheet, toast, pickDate } = useOverlays();
  const overdue = Boolean(task.due_at && new Date(task.due_at).getTime() < Date.now());
  const today = isToday(task.due_at);

  const complete = () => act(() => apiCompleteTask(getApi(), task.id)).then(() => toast(t.done));
  const moveDue = (due: Date) => act(() => apiUpdate(getApi(), "/tasks", task.id, { due_at: due.toISOString() }));

  const reschedule = async () => {
    const day = await pickDate(t.reschedule, task.due_at);
    if (!day) return;
    // Keep the time of day; a task without one lands at 9 AM.
    const old = task.due_at ? new Date(task.due_at) : null;
    const [year, month, date] = day.split("-").map(Number);
    await moveDue(new Date(year, month - 1, date, old?.getHours() ?? 9, old?.getMinutes() ?? 0));
  };

  const more = () =>
    sheet({
      title: task.title,
      detail: task.due_at ? when(task.due_at) : t.noDate,
      options: [
        { label: `✓ ${t.complete}`, run: complete },
        ...(task.due_at ? [{ label: `◷ ${t.snooze}`, run: () => void moveDue(new Date(new Date(task.due_at!).getTime() + 3_600_000)) }] : []),
        { label: `▭ ${t.reschedule}`, run: () => void reschedule() }
      ]
    });

  return (
    <ListRow
      leading={<CheckItem checked={false} label={`${t.complete}: ${task.title}`} onPress={complete} />}
      title={task.title}
      subtitle={task.due_at ? when(task.due_at) : null}
      badges={
        <>
          {overdue ? <Badge tone="urgent" glyph="!">{t.overdue}</Badge> : today ? <Badge tone="accent" glyph="◷">{t.dueToday}</Badge> : <Badge glyph="○">{task.due_at ? t.upcoming : t.noDate}</Badge>}
          {showPriority && task.priority !== "normal" ? <Badge tone={task.priority === "high" ? "urgent" : "neutral"} glyph={task.priority === "high" ? "↑" : "↓"}>{task.priority === "high" ? t.high : t.low}</Badge> : null}
        </>
      }
      trailing={<MoreButton onPress={more} label={`${t.reschedule}: ${task.title}`} />}
    />
  );
}
