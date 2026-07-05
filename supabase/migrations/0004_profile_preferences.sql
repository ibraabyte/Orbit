alter table public.profiles
  add column if not exists weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  add column if not exists daily_calorie_target integer check (daily_calorie_target is null or (daily_calorie_target >= 0 and daily_calorie_target <= 20000)),
  add column if not exists weekly_workout_minutes_target integer not null default 150 check (weekly_workout_minutes_target >= 0 and weekly_workout_minutes_target <= 10080);
