alter table public.profiles
  add column if not exists daily_protein_target integer check (daily_protein_target is null or (daily_protein_target >= 0 and daily_protein_target <= 1000)),
  add column if not exists daily_carbs_target integer check (daily_carbs_target is null or (daily_carbs_target >= 0 and daily_carbs_target <= 2000)),
  add column if not exists daily_fat_target integer check (daily_fat_target is null or (daily_fat_target >= 0 and daily_fat_target <= 1000));
