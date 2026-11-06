import { Alert } from "react-native";
import { useOverlays } from "@/components/overlays";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiCompleteTask, apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { listNameTaken, nextListPosition, onDay, snoozeChanges, snoozeTarget, SNOOZES } from "@/lib/tasks";
import type { Task, TaskList } from "@/lib/types";

// What can be done to a task from a row or from its own screen: finish, snooze, move, delete. Lists are made here too.
export function useTaskActions() {
  const { data, act, refresh } = useDashboardData();
  const { sheet, toast, pickDate } = useOverlays();

  const complete = async (task: Task) => {
    const ok = await act(() => apiCompleteTask(getApi(), task.id));
    if (ok) toast(t.done);
    return ok;
  };

  const update = (task: Task, changes: Record<string, unknown>) => act(() => apiUpdate(getApi(), "/tasks", task.id, changes));

  const moveTo = async (task: Task, until: Date, message = t.snoozed) => {
    const ok = await update(task, snoozeChanges(task, until));
    if (ok) toast(message);
    return ok;
  };

  const reschedule = async (task: Task) => {
    const day = await pickDate(t.pickDay, task.due_at);
    if (day) await moveTo(task, onDay(task, day), t.moved);
  };

  // In an hour, tonight, tomorrow, next week, or a day from the calendar. The reminder moves along with it.
  const snooze = (task: Task) =>
    sheet({
      title: t.snoozeTo,
      detail: task.title,
      options: [
        ...SNOOZES.flatMap((choice) => {
          const until = snoozeTarget(choice, task);
          return until ? [{ label: `◷ ${t.snoozeNames[choice]}`, run: () => void moveTo(task, until) }] : [];
        }),
        { label: `▭ ${t.pickDay}`, run: () => void reschedule(task) }
      ]
    });

  const remove = (task: Task, afterDelete?: () => void) =>
    sheet({
      title: t.deleteTaskTitle,
      detail: t.deleteTaskBody,
      options: [
        {
          label: t.deleteTask,
          destructive: true,
          run: () =>
            void act(() => getApi().delete(`/tasks/${encodeURIComponent(task.id)}`)).then((ok) => {
              if (!ok) return;
              toast(t.deleted);
              afterDelete?.();
            })
        }
      ]
    });

  // A new list at the end, or null (with an alert) when the name is taken or the save failed.
  const createList = async (name: string): Promise<TaskList | null> => {
    const clean = name.trim();
    if (!clean) return null;
    if (listNameTaken(data.taskLists, clean)) {
      Alert.alert(t.listTaken);
      return null;
    }
    try {
      const created = await getApi().post<TaskList>("/task-lists", { name: clean, position: nextListPosition(data.taskLists) });
      await refresh();
      return created;
    } catch (error) {
      Alert.alert(t.couldNotAdd, error instanceof Error ? error.message : t.tryAgain);
      return null;
    }
  };

  const renameList = async (list: TaskList, name: string) => {
    const clean = name.trim();
    if (!clean || clean === list.name) return true;
    if (listNameTaken(data.taskLists, clean, list.id)) {
      Alert.alert(t.listTaken);
      return false;
    }
    return act(() => apiUpdate(getApi(), "/task-lists", list.id, { name: clean }));
  };

  const removeList = (list: TaskList, afterDelete?: () => void) =>
    sheet({
      title: t.deleteListTitle,
      detail: `${list.name} · ${t.deleteListBody}`,
      options: [
        {
          label: t.deleteList,
          destructive: true,
          run: () =>
            void act(() => getApi().delete(`/task-lists/${encodeURIComponent(list.id)}`)).then((ok) => {
              if (ok) afterDelete?.();
            })
        }
      ]
    });

  return { complete, update, snooze, reschedule, remove, createList, renameList, removeList };
}
