create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text not null check (char_length(merchant) <= 220),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  category text not null default 'other' check (
    category in ('food', 'transport', 'fitness', 'home', 'subscriptions', 'shopping', 'health', 'travel', 'other')
  ),
  note text,
  spent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 220),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  category text not null default 'subscriptions' check (
    category in ('food', 'transport', 'fitness', 'home', 'subscriptions', 'shopping', 'health', 'travel', 'other')
  ),
  due_at date not null,
  recurrence text not null default 'monthly' check (recurrence in ('once', 'weekly', 'monthly', 'yearly')),
  status text not null default 'active' check (status in ('active', 'paid', 'paused')),
  autopay boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_user_spent_idx on public.expenses(user_id, spent_at desc);
create index if not exists expenses_user_category_idx on public.expenses(user_id, category, spent_at desc);
create index if not exists bills_user_due_idx on public.bills(user_id, status, due_at);

drop trigger if exists set_bills_updated_at on public.bills;
create trigger set_bills_updated_at
before update on public.bills
for each row execute function public.set_updated_at();

alter table public.expenses enable row level security;
alter table public.bills enable row level security;

create policy "expenses owner all" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bills owner all" on public.bills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.taggings
  drop constraint if exists taggings_target_type_check;

alter table public.taggings
  add constraint taggings_target_type_check
  check (target_type in ('task', 'capture', 'meal', 'workout', 'expense', 'bill'));
