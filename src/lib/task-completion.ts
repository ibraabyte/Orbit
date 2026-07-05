import type { SupabaseClient } from "@supabase/supabase-js";
import { nextRecurringTask } from "@/lib/recurrence";
import { tagsForTarget } from "@/lib/tag-actions";
import type { Database, Tag, Tagging, Task } from "@/lib/types";

type MutationResult = { error: { message: string } | null };
export type TaskCompletionClient = SupabaseClient<Database>;

export type TaskCompletionPlan = {
  taskUpdate: { status: "done" };
  scheduledReminderUpdate: { status: "cancelled" };
  scheduledReminderFilters: {
    taskId: string;
    userId: string;
    status: "scheduled";
  };
  nextTask: ReturnType<typeof nextRecurringTask>;
  tagsToCopy: Tag[];
};

export function buildTaskCompletionPlan({
  task,
  completedAt = new Date(),
  tags = [],
  taggings = []
}: {
  task: Task;
  completedAt?: Date;
  tags?: Tag[];
  taggings?: Tagging[];
}): TaskCompletionPlan {
  return {
    taskUpdate: { status: "done" },
    scheduledReminderUpdate: { status: "cancelled" },
    scheduledReminderFilters: {
      taskId: task.id,
      userId: task.user_id,
      status: "scheduled"
    },
    nextTask: nextRecurringTask(task, completedAt),
    tagsToCopy: tagsForTarget(tags, taggings, "task", task.id)
  };
}

export function buildTaskReminderInsert(task: Pick<Task, "id" | "user_id" | "title" | "notes" | "reminder_at">) {
  if (!task.reminder_at) return null;

  return {
    user_id: task.user_id,
    task_id: task.id,
    title: task.title,
    body: task.notes,
    remind_at: task.reminder_at,
    status: "scheduled" as const
  };
}

export async function completeTaskWithReminders(
  supabase: TaskCompletionClient,
  task: Task,
  options: {
    completedAt?: Date;
    tags?: Tag[];
    taggings?: Tagging[];
  } = {}
) {
  const plan = buildTaskCompletionPlan({ task, ...options });
  await assertNoError(await supabase.from("tasks").update(plan.taskUpdate).eq("id", task.id).eq("user_id", task.user_id));
  await assertNoError(
    await supabase
      .from("reminders")
      .update(plan.scheduledReminderUpdate)
      .eq("task_id", plan.scheduledReminderFilters.taskId)
      .eq("user_id", plan.scheduledReminderFilters.userId)
      .eq("status", plan.scheduledReminderFilters.status)
  );

  if (!plan.nextTask) return { createdTask: null };

  const { data: createdTask, error: taskError } = await supabase.from("tasks").insert(plan.nextTask).select().single();
  if (taskError || !createdTask) throw new Error(taskError?.message ?? "Recurring task could not be created.");

  const reminderInsert = buildTaskReminderInsert(createdTask);
  if (reminderInsert) {
    await assertNoError(await supabase.from("reminders").insert(reminderInsert));
  }

  if (plan.tagsToCopy.length) {
    await assertNoError(
      await supabase.from("taggings").upsert(
        plan.tagsToCopy.map((tag) => ({
          user_id: createdTask.user_id,
          tag_id: tag.id,
          target_type: "task" as const,
          target_id: createdTask.id
        })),
        { onConflict: "user_id,tag_id,target_type,target_id" }
      )
    );
  }

  return { createdTask };
}

async function assertNoError(result: MutationResult) {
  if (result.error) throw new Error(result.error.message);
}
