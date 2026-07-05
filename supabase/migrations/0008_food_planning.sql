create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  plan_date date not null,
  meal_type text not null default 'other' check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'other')),
  calories integer not null default 0 check (calories >= 0),
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  note text,
  status text not null default 'planned' check (status in ('planned', 'prepped', 'eaten', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_plan_id uuid references public.meal_plans(id) on delete set null,
  name text not null,
  quantity text,
  category text not null default 'other' check (category in ('produce', 'protein', 'dairy', 'pantry', 'frozen', 'household', 'other')),
  status text not null default 'needed' check (status in ('needed', 'bought', 'skipped')),
  due_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meal_plans_user_date_idx on public.meal_plans(user_id, plan_date desc);
create index if not exists meal_plans_user_status_idx on public.meal_plans(user_id, status, plan_date);
create index if not exists grocery_items_user_status_idx on public.grocery_items(user_id, status, created_at desc);
create index if not exists grocery_items_meal_plan_idx on public.grocery_items(meal_plan_id);

alter table public.meal_plans enable row level security;
alter table public.grocery_items enable row level security;

create policy "meal plans owner all" on public.meal_plans
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "grocery items owner all" on public.grocery_items
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.taggings
  drop constraint if exists taggings_target_type_check;

alter table public.taggings
  add constraint taggings_target_type_check
  check (target_type in ('task', 'capture', 'meal', 'workout', 'expense', 'bill', 'sleep', 'focus_session', 'meal_plan', 'grocery_item'));
