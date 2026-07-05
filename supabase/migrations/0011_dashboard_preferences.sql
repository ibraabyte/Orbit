alter table public.profiles
  add column if not exists dashboard_modules text[] not null default array[
    'attention',
    'tasks',
    'library',
    'reminders',
    'upcoming',
    'health',
    'review',
    'insights',
    'goals',
    'food',
    'finance',
    'people',
    'focus',
    'habits',
    'journal'
  ]::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_dashboard_modules_valid'
  ) then
    alter table public.profiles
      add constraint profiles_dashboard_modules_valid
      check (
        cardinality(dashboard_modules) > 0
        and dashboard_modules <@ array[
          'attention',
          'tasks',
          'library',
          'reminders',
          'upcoming',
          'health',
          'review',
          'insights',
          'goals',
          'food',
          'finance',
          'people',
          'focus',
          'habits',
          'journal'
        ]::text[]
      );
  end if;
end $$;
