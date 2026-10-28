import { NOT_ON_SERVER_YET, type ApiClient } from "@/lib/api";
import { validateQuickAddDraft, type QuickAddDraft } from "@/lib/quick-add";
import type { Reminder, Task } from "@/lib/types";

// Writes that have moved to Orbit's own server. Everything else still goes through Supabase for now.
type Api = Pick<ApiClient, "post">;

export async function apiQuickAdd(api: Api, draft: QuickAddDraft) {
  const validation = validateQuickAddDraft(draft);
  if (!validation.ok) throw new Error(validation.message ?? "Quick add command is incomplete.");

  if (draft.kind === "task") {
    // Refuse rather than drop the tags without saying so.
    if (draft.tags.length) throw new Error("Tags aren't on the new server yet. Add it without #tags.");
    // The server schedules the task's reminder in the same call.
    return api.post<Task>("/tasks", {
      title: draft.title,
      notes: draft.note,
      priority: draft.priority,
      due_at: draft.at,
      reminder_at: draft.reminderAt,
      recurrence: draft.recurrence
    });
  }

  if (draft.kind === "reminder") {
    return api.post<Reminder>("/reminders", {
      title: draft.title,
      body: draft.note,
      remind_at: draft.reminderAt ?? draft.at ?? new Date().toISOString()
    });
  }

  throw new Error(NOT_ON_SERVER_YET);
}

// Done, cancel its reminders, and roll a repeating task forward (with its tags), all on the server.
export function apiCompleteTask(api: Api, taskId: string) {
  return api.post<{ task: Task; next_task: Task | null }>(`/tasks/${encodeURIComponent(taskId)}/complete`);
}
