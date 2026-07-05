export type TaskStatus = "open" | "done" | "archived";
export type TaskPriority = "low" | "normal" | "high";
export type CaptureType = "link" | "screenshot" | "note";
export type ReminderStatus = "scheduled" | "sent" | "cancelled";
export type RecurrenceRule = "daily" | "weekly" | "monthly";
export type HabitFrequency = "daily" | "weekly";
export type GoalStatus = "active" | "completed" | "archived";
export type JournalMood = "great" | "good" | "neutral" | "low" | "bad";
export type WeightUnit = "kg" | "lb";
export type FinanceCategory = "food" | "transport" | "fitness" | "home" | "subscriptions" | "shopping" | "health" | "travel" | "other";
export type BillRecurrence = "once" | "weekly" | "monthly" | "yearly";
export type BillStatus = "active" | "paid" | "paused";
export type FocusSessionStatus = "planned" | "completed" | "cancelled";
export type MealPlanType = "breakfast" | "lunch" | "dinner" | "snack" | "other";
export type MealPlanStatus = "planned" | "prepped" | "eaten" | "skipped";
export type GroceryCategory = "produce" | "protein" | "dairy" | "pantry" | "frozen" | "household" | "other";
export type GroceryStatus = "needed" | "bought" | "skipped";
export type DashboardWidgetId =
  | "attention"
  | "tasks"
  | "library"
  | "reminders"
  | "upcoming"
  | "health"
  | "review"
  | "insights"
  | "goals"
  | "food"
  | "finance"
  | "people"
  | "focus"
  | "habits"
  | "journal";

export type Profile = {
  id: string;
  display_name: string | null;
  timezone: string;
  weight_unit: WeightUnit;
  daily_calorie_target: number | null;
  daily_protein_target: number | null;
  daily_carbs_target: number | null;
  daily_fat_target: number | null;
  weekly_workout_minutes_target: number;
  dashboard_modules: DashboardWidgetId[] | null;
  created_at: string;
};

export type Task = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  reminder_at: string | null;
  reminder_sent_at: string | null;
  recurrence: RecurrenceRule | null;
  created_at: string;
  updated_at: string;
};

export type Reminder = {
  id: string;
  user_id: string;
  task_id: string | null;
  title: string;
  body: string | null;
  remind_at: string;
  status: ReminderStatus;
  sent_at: string | null;
  created_at: string;
};

export type Capture = {
  id: string;
  user_id: string;
  type: CaptureType;
  url: string | null;
  title: string;
  note: string | null;
  source: string | null;
  created_at: string;
};

export type Attachment = {
  id: string;
  user_id: string;
  capture_id: string | null;
  bucket: string;
  object_path: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type Tag = {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
};

export type Tagging = {
  id: string;
  user_id: string;
  tag_id: string;
  target_type: "task" | "capture" | "meal" | "workout" | "expense" | "bill" | "sleep" | "focus_session" | "meal_plan" | "grocery_item";
  target_id: string;
  created_at: string;
};

export type Meal = {
  id: string;
  user_id: string;
  name: string;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  logged_at: string;
  created_at: string;
};

export type MealPlan = {
  id: string;
  user_id: string;
  name: string;
  plan_date: string;
  meal_type: MealPlanType;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  note: string | null;
  status: MealPlanStatus;
  created_at: string;
  updated_at: string;
};

export type GroceryItem = {
  id: string;
  user_id: string;
  meal_plan_id: string | null;
  name: string;
  quantity: string | null;
  category: GroceryCategory;
  status: GroceryStatus;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Person = {
  id: string;
  user_id: string;
  name: string;
  relationship: string | null;
  contact_method: string | null;
  birthday: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  favorite: boolean;
  created_at: string;
  updated_at: string;
};

export type WeightLog = {
  id: string;
  user_id: string;
  weight: number;
  unit: WeightUnit;
  logged_at: string;
  created_at: string;
};

export type Workout = {
  id: string;
  user_id: string;
  type: string;
  duration_minutes: number | null;
  calories: number | null;
  notes: string | null;
  logged_at: string;
  created_at: string;
};

export type SleepLog = {
  id: string;
  user_id: string;
  sleep_date: string;
  duration_minutes: number;
  quality: number | null;
  bedtime_at: string | null;
  woke_at: string | null;
  note: string | null;
  created_at: string;
};

export type FocusSession = {
  id: string;
  user_id: string;
  task_id: string | null;
  title: string;
  duration_minutes: number;
  started_at: string;
  ended_at: string | null;
  status: FocusSessionStatus;
  energy: number | null;
  note: string | null;
  created_at: string;
};

export type PushSubscriptionRecord = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
};

export type Habit = {
  id: string;
  user_id: string;
  name: string;
  frequency: HabitFrequency;
  target_count: number;
  color: string | null;
  archived_at: string | null;
  created_at: string;
};

export type HabitLog = {
  id: string;
  user_id: string;
  habit_id: string;
  logged_at: string;
  note: string | null;
  created_at: string;
};

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  status: GoalStatus;
  target_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalMilestone = {
  id: string;
  user_id: string;
  goal_id: string;
  title: string;
  completed_at: string | null;
  created_at: string;
};

export type JournalEntry = {
  id: string;
  user_id: string;
  mood: JournalMood;
  title: string | null;
  body: string;
  entry_date: string;
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: string;
  user_id: string;
  merchant: string;
  amount: number;
  currency: string;
  category: FinanceCategory;
  note: string | null;
  spent_at: string;
  created_at: string;
};

export type Bill = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  category: FinanceCategory;
  due_at: string;
  recurrence: BillRecurrence;
  status: BillStatus;
  autopay: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type TableDefinition<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDefinition<
        Profile,
        Pick<Profile, "id"> & Partial<Omit<Profile, "id" | "created_at">>,
        Partial<Omit<Profile, "id" | "created_at">>
      >;
      tasks: TableDefinition<
        Task,
        Omit<Task, "id" | "created_at" | "updated_at" | "reminder_sent_at"> & {
          id?: string;
          reminder_sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<Omit<Task, "id" | "user_id" | "created_at" | "updated_at">>
      >;
      reminders: TableDefinition<
        Reminder,
        Omit<Reminder, "id" | "created_at" | "sent_at"> & {
          id?: string;
          sent_at?: string | null;
          created_at?: string;
        },
        Partial<Omit<Reminder, "id" | "user_id" | "created_at">>
      >;
      captures: TableDefinition<
        Capture,
        Omit<Capture, "id" | "created_at"> & { id?: string; created_at?: string },
        Partial<Omit<Capture, "id" | "user_id" | "created_at">>
      >;
      attachments: TableDefinition<
        Attachment,
        Omit<Attachment, "id" | "created_at"> & { id?: string; created_at?: string },
        Partial<Omit<Attachment, "id" | "user_id" | "created_at">>
      >;
      tags: TableDefinition<
        Tag,
        Omit<Tag, "id" | "created_at"> & { id?: string; created_at?: string },
        Partial<Omit<Tag, "id" | "user_id" | "created_at">>
      >;
      taggings: TableDefinition<
        Tagging,
        Omit<Tagging, "id" | "created_at"> & { id?: string; created_at?: string },
        Partial<Omit<Tagging, "id" | "user_id" | "created_at">>
      >;
      meals: TableDefinition<
        Meal,
        Omit<Meal, "id" | "created_at"> & { id?: string; created_at?: string },
        Partial<Omit<Meal, "id" | "user_id" | "created_at">>
      >;
      meal_plans: TableDefinition<
        MealPlan,
        Omit<MealPlan, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string },
        Partial<Omit<MealPlan, "id" | "user_id" | "created_at" | "updated_at">>
      >;
      grocery_items: TableDefinition<
        GroceryItem,
        Omit<GroceryItem, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string },
        Partial<Omit<GroceryItem, "id" | "user_id" | "created_at" | "updated_at">>
      >;
      people: TableDefinition<
        Person,
        Omit<Person, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string },
        Partial<Omit<Person, "id" | "user_id" | "created_at" | "updated_at">>
      >;
      weight_logs: TableDefinition<
        WeightLog,
        Omit<WeightLog, "id" | "created_at"> & { id?: string; created_at?: string },
        Partial<Omit<WeightLog, "id" | "user_id" | "created_at">>
      >;
      workouts: TableDefinition<
        Workout,
        Omit<Workout, "id" | "created_at"> & { id?: string; created_at?: string },
        Partial<Omit<Workout, "id" | "user_id" | "created_at">>
      >;
      sleep_logs: TableDefinition<
        SleepLog,
        Omit<SleepLog, "id" | "created_at"> & { id?: string; created_at?: string },
        Partial<Omit<SleepLog, "id" | "user_id" | "created_at">>
      >;
      focus_sessions: TableDefinition<
        FocusSession,
        Omit<FocusSession, "id" | "created_at"> & { id?: string; created_at?: string },
        Partial<Omit<FocusSession, "id" | "user_id" | "created_at">>
      >;
      push_subscriptions: TableDefinition<
        PushSubscriptionRecord,
        Omit<PushSubscriptionRecord, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        },
        Partial<Omit<PushSubscriptionRecord, "id" | "user_id" | "created_at" | "updated_at">>
      >;
      habits: TableDefinition<
        Habit,
        Omit<Habit, "id" | "created_at" | "archived_at"> & { id?: string; created_at?: string; archived_at?: string | null },
        Partial<Omit<Habit, "id" | "user_id" | "created_at">>
      >;
      habit_logs: TableDefinition<
        HabitLog,
        Omit<HabitLog, "id" | "created_at"> & { id?: string; created_at?: string },
        Partial<Omit<HabitLog, "id" | "user_id" | "created_at">>
      >;
      goals: TableDefinition<
        Goal,
        Omit<Goal, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string },
        Partial<Omit<Goal, "id" | "user_id" | "created_at" | "updated_at">>
      >;
      goal_milestones: TableDefinition<
        GoalMilestone,
        Omit<GoalMilestone, "id" | "created_at"> & { id?: string; created_at?: string },
        Partial<Omit<GoalMilestone, "id" | "user_id" | "created_at">>
      >;
      journal_entries: TableDefinition<
        JournalEntry,
        Omit<JournalEntry, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string },
        Partial<Omit<JournalEntry, "id" | "user_id" | "created_at" | "updated_at">>
      >;
      expenses: TableDefinition<
        Expense,
        Omit<Expense, "id" | "created_at"> & { id?: string; created_at?: string },
        Partial<Omit<Expense, "id" | "user_id" | "created_at">>
      >;
      bills: TableDefinition<
        Bill,
        Omit<Bill, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string },
        Partial<Omit<Bill, "id" | "user_id" | "created_at" | "updated_at">>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type DashboardData = {
  profile: Profile | null;
  tasks: Task[];
  reminders: Reminder[];
  captures: Capture[];
  attachments: Attachment[];
  tags: Tag[];
  taggings: Tagging[];
  meals: Meal[];
  mealPlans: MealPlan[];
  groceryItems: GroceryItem[];
  people: Person[];
  weightLogs: WeightLog[];
  workouts: Workout[];
  sleepLogs: SleepLog[];
  focusSessions: FocusSession[];
  habits: Habit[];
  habitLogs: HabitLog[];
  goals: Goal[];
  goalMilestones: GoalMilestone[];
  journalEntries: JournalEntry[];
  expenses: Expense[];
  bills: Bill[];
};
