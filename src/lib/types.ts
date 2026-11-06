export type TaskStatus = "open" | "done" | "archived";
export type TaskPriority = "low" | "normal" | "high";
export type CaptureType = "link" | "screenshot" | "note";
export type ReminderStatus = "scheduled" | "sent" | "cancelled";
export type RecurrenceRule = "daily" | "weekly" | "monthly";
export type HabitFrequency = "daily" | "weekly";
export type WeightUnit = "kg" | "lb";
export type FinanceCategory = "food" | "transport" | "fitness" | "home" | "subscriptions" | "shopping" | "health" | "travel" | "groceries" | "bills" | "services" | "other";
export type BillRecurrence = "once" | "weekly" | "monthly" | "yearly";
export type BillStatus = "active" | "paid" | "paused";
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
  list_id: string | null;
  created_at: string;
  updated_at: string;
};

// A named group of tasks (Home, Work). Deleting one keeps its tasks.
export type TaskList = {
  id: string;
  user_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
};

// One checklist line inside a task (a subtask).
export type TaskStep = {
  id: string;
  user_id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
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
  // The saver: a built-in category ("video", "post", ...) or one the user named; "want" = still to see, "done" = seen.
  category: string;
  status: "want" | "done";
  image_url: string | null;
  site_name: string | null;
  summary: string | null;
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
  target_type: "task" | "capture" | "meal" | "workout" | "expense" | "bill" | "sleep" | "meal_plan" | "grocery_item";
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
  food_id?: string | null;
  servings?: number | null;
  meal_type?: "breakfast" | "lunch" | "dinner" | "snack" | "other" | null;
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
  // The card it is charged to, if one was picked.
  card_id: string | null;
};

export type Budget = {
  id: string;
  user_id: string;
  // First day of the month, YYYY-MM-01.
  month: string;
  category: FinanceCategory;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type CardNetwork = "mada" | "visa" | "mastercard" | "amex" | "other";
export type CardKind = "credit" | "debit" | "prepaid";

// Only the last four digits are ever kept.
export type PaymentCard = {
  id: string;
  user_id: string;
  name: string;
  network: CardNetwork;
  kind: CardKind;
  last4: string;
  // First day of the month on the card (08/28 is 2028-08-01), or null.
  expires_on: string | null;
  created_at: string;
  updated_at: string;
};

export type MoneyAccountKind = "bank" | "savings" | "wallet" | "cash" | "other";

export type MoneyAccount = {
  id: string;
  user_id: string;
  name: string;
  kind: MoneyAccountKind;
  balance: number;
  currency: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentKind = "stocks" | "funds" | "sukuk" | "crowdfunding" | "real_estate" | "crypto" | "gold" | "savings" | "other";

export type Investment = {
  id: string;
  user_id: string;
  name: string;
  kind: InvestmentKind;
  invested: number;
  current_value: number;
  currency: string;
  started_on: string | null;
  note: string | null;
  valued_at: string;
  created_at: string;
  updated_at: string;
};

export type ObligationKind = "bnpl" | "loan" | "installment" | "other";

export type Obligation = {
  id: string;
  user_id: string;
  name: string;
  kind: ObligationKind;
  provider: string | null;
  total_amount: number;
  currency: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ObligationInstallment = {
  id: string;
  user_id: string;
  obligation_id: string;
  due_on: string;
  amount: number;
  paid_at: string | null;
  created_at: string;
};

export type Vehicle = {
  id: string;
  user_id: string;
  name: string;
  plate: string | null;
  odometer_km: number | null;
  registration_expires_at: string | null;
  insurance_expires_at: string | null;
  inspection_expires_at: string | null;
  next_oil_change_at: string | null;
  next_oil_change_km: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type WatchStatus = "want" | "watching" | "done";

export type WatchItem = {
  id: string;
  user_id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  status: WatchStatus;
  season: number | null;
  episode: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DashboardData = {
  profile: Profile | null;
  tasks: Task[];
  taskLists: TaskList[];
  taskSteps: TaskStep[];
  reminders: Reminder[];
  captures: Capture[];
  attachments: Attachment[];
  tags: Tag[];
  taggings: Tagging[];
  meals: Meal[];
  mealPlans: MealPlan[];
  groceryItems: GroceryItem[];
  weightLogs: WeightLog[];
  workouts: Workout[];
  sleepLogs: SleepLog[];
  habits: Habit[];
  habitLogs: HabitLog[];
  expenses: Expense[];
  bills: Bill[];
  budgets: Budget[];
  cards: PaymentCard[];
  moneyAccounts: MoneyAccount[];
  investments: Investment[];
  obligations: Obligation[];
  obligationInstallments: ObligationInstallment[];
};
