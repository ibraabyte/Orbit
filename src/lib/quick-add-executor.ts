import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTaskReminderInsert } from "@/lib/task-completion";
import { getSupabase } from "@/lib/supabase";
import { createTaggings, ensureTags } from "@/lib/tag-actions";
import type { Database, Tagging } from "@/lib/types";
import { sourceFromUrl } from "@/lib/url";
import { validateQuickAddDraft, type QuickAddDraft } from "@/lib/quick-add";

type MutationResult<T = unknown> = {
  data?: T | null;
  error: { message: string } | null;
};

export type QuickAddClient = SupabaseClient<Database>;
type QuickAddTagTarget = Extract<
  Tagging["target_type"],
  "task" | "capture" | "meal" | "meal_plan" | "grocery_item" | "workout" | "sleep" | "focus_session" | "expense" | "bill"
>;

export async function executeQuickAdd(userId: string, draft: QuickAddDraft, supabase: QuickAddClient = getSupabase()) {
  const validation = validateQuickAddDraft(draft);
  if (!validation.ok) throw new Error(validation.message ?? "Quick add command is incomplete.");

  if (draft.kind === "task") {
    const task = recordOrThrow<Parameters<typeof buildTaskReminderInsert>[0]>(
      await supabase
        .from("tasks")
        .insert({
          user_id: userId,
          title: draft.title,
          notes: draft.note,
          status: "open",
          priority: draft.priority,
          due_at: draft.at,
          reminder_at: draft.reminderAt,
          recurrence: draft.recurrence
        })
        .select()
        .single(),
      "Task"
    );
    await tagTarget(supabase, userId, "task", task.id, draft.tags);
    const reminderInsert = buildTaskReminderInsert(task);
    if (reminderInsert) await assertNoError(await supabase.from("reminders").insert(reminderInsert), "Task reminder");
    return;
  }

  if (draft.kind === "reminder") {
    await assertNoError(
      await supabase.from("reminders").insert({
        user_id: userId,
        task_id: null,
        title: draft.title,
        body: draft.note,
        remind_at: draft.reminderAt ?? draft.at ?? new Date().toISOString(),
        status: "scheduled"
      }),
      "Reminder"
    );
    return;
  }

  if (draft.kind === "capture") {
    const capture = recordOrThrow(
      await supabase
        .from("captures")
        .insert({
          user_id: userId,
          type: draft.captureType,
          title: draft.title,
          url: draft.url,
          note: draft.note,
          source: sourceFromUrl(draft.url)
        })
        .select()
        .single(),
      "Capture"
    );
    await tagTarget(supabase, userId, "capture", capture.id, draft.tags);
    return;
  }

  if (draft.kind === "meal") {
    const meal = recordOrThrow(
      await supabase
        .from("meals")
        .insert({
          user_id: userId,
          name: draft.title,
          calories: draft.calories ?? 0,
          protein_g: draft.proteinG,
          carbs_g: draft.carbsG,
          fat_g: draft.fatG,
          logged_at: draft.at ?? new Date().toISOString()
        })
        .select()
        .single(),
      "Meal"
    );
    await tagTarget(supabase, userId, "meal", meal.id, draft.tags);
    return;
  }

  if (draft.kind === "mealPlan") {
    const plan = recordOrThrow(
      await supabase
        .from("meal_plans")
        .insert({
          user_id: userId,
          name: draft.title,
          plan_date: draft.at ? draft.at.slice(0, 10) : new Date().toISOString().slice(0, 10),
          meal_type: draft.mealType,
          calories: draft.calories ?? 0,
          protein_g: draft.proteinG,
          carbs_g: draft.carbsG,
          fat_g: draft.fatG,
          note: draft.note,
          status: "planned"
        })
        .select()
        .single(),
      "Meal plan"
    );
    await tagTarget(supabase, userId, "meal_plan", plan.id, draft.tags);
    return;
  }

  if (draft.kind === "grocery") {
    const item = recordOrThrow(
      await supabase
        .from("grocery_items")
        .insert({
          user_id: userId,
          meal_plan_id: null,
          name: draft.title,
          quantity: draft.groceryQuantity,
          category: draft.groceryCategory,
          status: "needed",
          due_at: draft.at ? draft.at.slice(0, 10) : null
        })
        .select()
        .single(),
      "Grocery item"
    );
    await tagTarget(supabase, userId, "grocery_item", item.id, draft.tags);
    return;
  }

  if (draft.kind === "person") {
    await assertNoError(
      await supabase.from("people").insert({
        user_id: userId,
        name: draft.title,
        relationship: draft.personRelationship,
        contact_method: draft.contactMethod,
        birthday: draft.birthday,
        last_contacted_at: null,
        next_follow_up_at: draft.at ? draft.at.slice(0, 10) : null,
        notes: draft.note,
        favorite: draft.favorite
      }),
      "Person"
    );
    return;
  }

  if (draft.kind === "workout") {
    const workout = recordOrThrow(
      await supabase
        .from("workouts")
        .insert({
          user_id: userId,
          type: draft.title,
          duration_minutes: draft.durationMinutes,
          calories: draft.calories,
          notes: draft.note,
          logged_at: draft.at ?? new Date().toISOString()
        })
        .select()
        .single(),
      "Workout"
    );
    await tagTarget(supabase, userId, "workout", workout.id, draft.tags);
    return;
  }

  if (draft.kind === "weight") {
    if (!draft.weight) throw new Error("Weight commands need a value like 82kg or 180lb.");
    await assertNoError(
      await supabase.from("weight_logs").insert({
        user_id: userId,
        weight: draft.weight,
        unit: draft.unit,
        logged_at: draft.at ?? new Date().toISOString()
      }),
      "Weight log"
    );
    return;
  }

  if (draft.kind === "sleep") {
    if (!draft.sleepMinutes) throw new Error("Sleep commands need a duration like 7.5h or 450min.");
    const sleep = recordOrThrow(
      await supabase
        .from("sleep_logs")
        .insert({
          user_id: userId,
          sleep_date: draft.at ? draft.at.slice(0, 10) : new Date().toISOString().slice(0, 10),
          duration_minutes: draft.sleepMinutes,
          quality: draft.sleepQuality,
          bedtime_at: null,
          woke_at: null,
          note: draft.title === "Sleep log" ? null : draft.title
        })
        .select()
        .single(),
      "Sleep log"
    );
    await tagTarget(supabase, userId, "sleep", sleep.id, draft.tags);
    return;
  }

  if (draft.kind === "focus") {
    if (!draft.durationMinutes) throw new Error("Focus commands need a duration like 50min.");
    const startedAt = draft.at ?? new Date().toISOString();
    const now = new Date();
    const isPlanned = new Date(startedAt).getTime() > now.getTime();
    const focusSession = recordOrThrow(
      await supabase
        .from("focus_sessions")
        .insert({
          user_id: userId,
          task_id: null,
          title: draft.title,
          duration_minutes: draft.durationMinutes,
          started_at: startedAt,
          ended_at: isPlanned ? null : new Date(new Date(startedAt).getTime() + draft.durationMinutes * 60_000).toISOString(),
          status: isPlanned ? "planned" : "completed",
          energy: isPlanned ? null : draft.focusEnergy,
          note: draft.note
        })
        .select()
        .single(),
      "Focus session"
    );
    await tagTarget(supabase, userId, "focus_session", focusSession.id, draft.tags);
    return;
  }

  if (draft.kind === "expense") {
    if (!draft.amount) throw new Error("Expense commands need an amount like 4.50 USD.");
    const expense = recordOrThrow(
      await supabase
        .from("expenses")
        .insert({
          user_id: userId,
          merchant: draft.title,
          amount: draft.amount,
          currency: draft.currency,
          category: draft.financeCategory,
          note: draft.note,
          spent_at: draft.at ?? new Date().toISOString()
        })
        .select()
        .single(),
      "Expense"
    );
    await tagTarget(supabase, userId, "expense", expense.id, draft.tags);
    return;
  }

  if (draft.kind === "bill") {
    if (!draft.amount) throw new Error("Bill commands need an amount like 65 USD.");
    const bill = recordOrThrow(
      await supabase
        .from("bills")
        .insert({
          user_id: userId,
          name: draft.title,
          amount: draft.amount,
          currency: draft.currency,
          category: draft.financeCategory,
          due_at: draft.at ? draft.at.slice(0, 10) : new Date().toISOString().slice(0, 10),
          recurrence: draft.billRecurrence,
          status: "active",
          autopay: draft.billAutopay,
          note: draft.note
        })
        .select()
        .single(),
      "Bill"
    );
    await tagTarget(supabase, userId, "bill", bill.id, draft.tags);
    return;
  }

  if (draft.kind === "habit") {
    await assertNoError(
      await supabase.from("habits").insert({
        user_id: userId,
        name: draft.title,
        frequency: draft.frequency,
        target_count: 1,
        color: null
      }),
      "Habit"
    );
    return;
  }

  if (draft.kind === "goal") {
    await assertNoError(
      await supabase.from("goals").insert({
        user_id: userId,
        title: draft.title,
        notes: draft.note,
        status: "active",
        target_at: draft.at ? draft.at.slice(0, 10) : null
      }),
      "Goal"
    );
    return;
  }

  await assertNoError(
    await supabase.from("journal_entries").upsert(
      {
        user_id: userId,
        mood: draft.mood,
        title: null,
        body: draft.title,
        entry_date: draft.at ? draft.at.slice(0, 10) : new Date().toISOString().slice(0, 10)
      },
      { onConflict: "user_id,entry_date" }
    ),
    "Journal entry"
  );
}

async function tagTarget(supabase: QuickAddClient, userId: string, targetType: QuickAddTagTarget, targetId: string, names: string[]) {
  const tags = await ensureTags(userId, names, supabase);
  await createTaggings(userId, targetType, targetId, tags, supabase);
}

function recordOrThrow<T extends { id: string } = { id: string }>(result: MutationResult<unknown>, label: string) {
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error(`${label} could not be saved.`);
  return result.data as T;
}

async function assertNoError(result: MutationResult, label: string) {
  if (result.error) throw new Error(result.error.message || `${label} could not be saved.`);
}
