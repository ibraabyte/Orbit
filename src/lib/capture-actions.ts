import type { SupabaseClient } from "@supabase/supabase-js";
import { createTaggings, ensureTags } from "@/lib/tag-actions";
import { getSupabase } from "@/lib/supabase";
import type { Attachment, Capture, Database, Reminder, Tag, Task } from "@/lib/types";
import { captureSourceLabel } from "@/lib/library";

export type CaptureActionClient = SupabaseClient<Database>;

const taskTagName = "from-capture";
const handledCaptureTagName = "tasked";
const remindedCaptureTagName = "reminded";

export function captureTaskTitle(capture: Pick<Capture, "title">) {
  return `Review: ${capture.title}`;
}

export function captureTaskNotes(capture: Capture, attachments: Attachment[] = []) {
  const lines = [
    capture.note?.trim() || null,
    capture.url ? `Link: ${capture.url}` : null,
    `Source: ${captureSourceLabel(capture)}`,
    attachments.length ? `Attachments: ${attachments.map((attachment) => attachment.filename).join(", ")}` : null
  ].filter(Boolean);

  return lines.join("\n");
}

export function captureReminderTitle(capture: Pick<Capture, "title">) {
  return `Follow up: ${capture.title}`;
}

export function captureReminderBody(capture: Capture, attachments: Attachment[] = []) {
  return captureTaskNotes(capture, attachments);
}

export function defaultCaptureReminderAt(now = new Date()) {
  const reminderAt = new Date(now);
  reminderAt.setDate(reminderAt.getDate() + 1);
  reminderAt.setHours(9, 0, 0, 0);
  return reminderAt.toISOString();
}

export async function createTaskFromCapture(
  userId: string,
  capture: Capture,
  attachments: Attachment[] = [],
  supabase: CaptureActionClient = getSupabase()
) {
  let task: Task | null = null;
  let tags: Tag[] = [];

  try {
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        title: captureTaskTitle(capture),
        notes: captureTaskNotes(capture, attachments) || null,
        status: "open",
        priority: "normal",
        due_at: null,
        reminder_at: null,
        recurrence: null
      })
      .select()
      .single();

    if (error || !data) throw new Error(error?.message ?? "Task could not be created from capture.");
    task = data as Task;

    tags = await ensureTags(userId, [taskTagName, handledCaptureTagName], supabase);
    const taskTag = tagByName(tags, taskTagName);
    const captureTag = tagByName(tags, handledCaptureTagName);

    if (taskTag) await createTaggings(userId, "task", task.id, [taskTag], supabase);
    if (captureTag) await createTaggings(userId, "capture", capture.id, [captureTag], supabase);

    return task;
  } catch (error) {
    if (task) {
      await rollbackCaptureTask(userId, task.id, supabase);
    }
    throw error;
  }
}

export async function createReminderFromCapture(
  userId: string,
  capture: Capture,
  attachments: Attachment[] = [],
  remindAt = defaultCaptureReminderAt(),
  supabase: CaptureActionClient = getSupabase()
) {
  let reminder: Reminder | null = null;

  try {
    const { data, error } = await supabase
      .from("reminders")
      .insert({
        user_id: userId,
        task_id: null,
        title: captureReminderTitle(capture),
        body: captureReminderBody(capture, attachments) || null,
        remind_at: remindAt,
        status: "scheduled"
      })
      .select()
      .single();

    if (error || !data) throw new Error(error?.message ?? "Reminder could not be created from capture.");
    reminder = data as Reminder;

    const tags = await ensureTags(userId, [remindedCaptureTagName], supabase);
    const captureTag = tagByName(tags, remindedCaptureTagName);

    if (captureTag) await createTaggings(userId, "capture", capture.id, [captureTag], supabase);

    return reminder;
  } catch (error) {
    if (reminder) {
      await rollbackCaptureReminder(userId, reminder.id, supabase);
    }
    throw error;
  }
}

async function rollbackCaptureTask(userId: string, taskId: string, supabase: CaptureActionClient) {
  await supabase.from("taggings").delete().eq("user_id", userId).eq("target_type", "task").eq("target_id", taskId);
  await supabase.from("tasks").delete().eq("id", taskId).eq("user_id", userId);
}

async function rollbackCaptureReminder(userId: string, reminderId: string, supabase: CaptureActionClient) {
  await supabase.from("reminders").delete().eq("id", reminderId).eq("user_id", userId);
}

function tagByName(tags: Tag[], name: string) {
  return tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase()) ?? null;
}
