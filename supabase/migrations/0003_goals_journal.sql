create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 220),
  notes text,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  target_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null check (char_length(title) <= 220),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mood text not null default 'neutral' check (mood in ('great', 'good', 'neutral', 'low', 'bad')),
  title text check (char_length(title) <= 220),
  body text not null,
  entry_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goals_user_status_idx on public.goals(user_id, status, updated_at desc);
create index if not exists goal_milestones_goal_idx on public.goal_milestones(goal_id, completed_at);
create index if not exists journal_entries_user_date_idx on public.journal_entries(user_id, entry_date desc);
create unique index if not exists journal_entries_user_entry_date_idx on public.journal_entries(user_id, entry_date);

drop trigger if exists set_goals_updated_at on public.goals;
create trigger set_goals_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

drop trigger if exists set_journal_entries_updated_at on public.journal_entries;
create trigger set_journal_entries_updated_at
before update on public.journal_entries
for each row execute function public.set_updated_at();

alter table public.goals enable row level security;
alter table public.goal_milestones enable row level security;
alter table public.journal_entries enable row level security;

create policy "goals owner all" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goal milestones owner all" on public.goal_milestones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "journal entries owner all" on public.journal_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
