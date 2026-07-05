create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 180),
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly')),
  target_count integer not null default 1 check (target_count > 0 and target_count <= 21),
  color text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  logged_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists habits_user_active_idx on public.habits(user_id, archived_at);
create index if not exists habit_logs_user_logged_idx on public.habit_logs(user_id, logged_at desc);
create index if not exists habit_logs_habit_logged_idx on public.habit_logs(habit_id, logged_at desc);

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

create policy "habits owner all" on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habit logs owner all" on public.habit_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
