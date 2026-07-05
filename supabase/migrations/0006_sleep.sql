create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sleep_date date not null,
  duration_minutes integer not null check (duration_minutes >= 0 and duration_minutes <= 1440),
  quality integer check (quality is null or (quality >= 1 and quality <= 5)),
  bedtime_at timestamptz,
  woke_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists sleep_logs_user_date_idx on public.sleep_logs(user_id, sleep_date desc);

alter table public.sleep_logs enable row level security;

create policy "sleep logs owner all" on public.sleep_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.taggings
  drop constraint if exists taggings_target_type_check;

alter table public.taggings
  add constraint taggings_target_type_check
  check (target_type in ('task', 'capture', 'meal', 'workout', 'expense', 'bill', 'sleep'));
