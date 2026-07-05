create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 220),
  notes text,
  status text not null default 'open' check (status in ('open', 'done', 'archived')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_at timestamptz,
  reminder_at timestamptz,
  recurrence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  title text not null check (char_length(title) <= 220),
  body text,
  remind_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'cancelled')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'link' check (type in ('link', 'screenshot', 'note')),
  url text,
  title text not null check (char_length(title) <= 280),
  note text,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid references public.captures(id) on delete cascade,
  bucket text not null,
  object_path text not null,
  filename text not null,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);

create table if not exists public.taggings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  target_type text not null check (target_type in ('task', 'capture', 'meal', 'workout')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, tag_id, target_type, target_id)
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 220),
  calories integer not null check (calories >= 0),
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  logged_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight numeric not null check (weight > 0),
  unit text not null default 'kg' check (unit in ('kg', 'lb')),
  logged_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (char_length(type) <= 160),
  duration_minutes integer check (duration_minutes >= 0),
  calories integer check (calories >= 0),
  notes text,
  logged_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists tasks_user_due_idx on public.tasks(user_id, due_at);
create index if not exists reminders_due_idx on public.reminders(status, remind_at);
create index if not exists captures_user_created_idx on public.captures(user_id, created_at desc);
create index if not exists meals_user_logged_idx on public.meals(user_id, logged_at desc);
create index if not exists workouts_user_logged_idx on public.workouts(user_id, logged_at desc);
create index if not exists weight_user_logged_idx on public.weight_logs(user_id, logged_at desc);
create unique index if not exists tags_user_lower_name_idx on public.tags(user_id, lower(name));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists set_push_subscriptions_updated_at on public.push_subscriptions;
create trigger set_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'UTC'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.reminders enable row level security;
alter table public.captures enable row level security;
alter table public.attachments enable row level security;
alter table public.tags enable row level security;
alter table public.taggings enable row level security;
alter table public.meals enable row level security;
alter table public.weight_logs enable row level security;
alter table public.workouts enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "profiles are owner visible" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles are owner editable" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "tasks owner all" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reminders owner all" on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "captures owner all" on public.captures
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "attachments owner all" on public.attachments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tags owner all" on public.tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "taggings owner all" on public.taggings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "meals owner all" on public.meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "weight logs owner all" on public.weight_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "workouts owner all" on public.workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push subscriptions owner all" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'orbit-attachments',
  'orbit-attachments',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do nothing;

create policy "users upload own orbit attachments" on storage.objects
  for insert with check (
    bucket_id = 'orbit-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users read own orbit attachments" on storage.objects
  for select using (
    bucket_id = 'orbit-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users update own orbit attachments" on storage.objects
  for update using (
    bucket_id = 'orbit-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'orbit-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users delete own orbit attachments" on storage.objects
  for delete using (
    bucket_id = 'orbit-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
