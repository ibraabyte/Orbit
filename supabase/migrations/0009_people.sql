create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship text,
  contact_method text,
  birthday date,
  last_contacted_at date,
  next_follow_up_at date,
  notes text,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists people_user_name_idx on public.people(user_id, name);
create index if not exists people_user_followup_idx on public.people(user_id, next_follow_up_at);
create index if not exists people_user_birthday_idx on public.people(user_id, birthday);
create index if not exists people_user_favorite_idx on public.people(user_id, favorite);

alter table public.people enable row level security;

create policy "people owner all" on public.people
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
