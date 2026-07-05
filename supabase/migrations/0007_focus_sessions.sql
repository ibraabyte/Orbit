create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  title text not null check (char_length(title) <= 220),
  duration_minutes integer not null check (duration_minutes >= 0 and duration_minutes <= 1440),
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null default 'completed' check (status in ('planned', 'completed', 'cancelled')),
  energy integer check (energy is null or (energy >= 1 and energy <= 5)),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists focus_sessions_user_started_idx on public.focus_sessions(user_id, started_at desc);
create index if not exists focus_sessions_user_status_idx on public.focus_sessions(user_id, status, started_at);
create index if not exists focus_sessions_task_idx on public.focus_sessions(task_id, started_at desc);

alter table public.focus_sessions enable row level security;

create policy "focus sessions owner all" on public.focus_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.taggings
  drop constraint if exists taggings_target_type_check;

alter table public.taggings
  add constraint taggings_target_type_check
  check (target_type in ('task', 'capture', 'meal', 'workout', 'expense', 'bill', 'sleep', 'focus_session'));
