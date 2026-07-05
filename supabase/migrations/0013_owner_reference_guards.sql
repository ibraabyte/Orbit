create or replace function public.ensure_orbit_same_owner_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  reference_id uuid;
  reference_column text := tg_argv[0];
  reference_table text := tg_argv[1];
  reference_exists boolean;
begin
  if reference_table not in ('tasks', 'captures', 'meal_plans', 'habits', 'goals') then
    raise exception 'Unsupported Orbit owner reference table: %', reference_table;
  end if;

  owner_id := (to_jsonb(new)->>'user_id')::uuid;
  reference_id := nullif(to_jsonb(new)->>reference_column, '')::uuid;
  if reference_id is null then
    return new;
  end if;

  execute format('select exists (select 1 from public.%I where id = $1 and user_id = $2)', reference_table)
    using reference_id, owner_id
    into reference_exists;

  if not reference_exists then
    raise exception '% must reference a % row owned by the same user', reference_column, reference_table
      using errcode = '23503';
  end if;

  return new;
end;
$$;

create or replace function public.ensure_orbit_tagging_same_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_table text;
  tag_exists boolean;
  target_exists boolean;
begin
  target_table := case new.target_type
    when 'task' then 'tasks'
    when 'capture' then 'captures'
    when 'meal' then 'meals'
    when 'workout' then 'workouts'
    when 'expense' then 'expenses'
    when 'bill' then 'bills'
    when 'sleep' then 'sleep_logs'
    when 'focus_session' then 'focus_sessions'
    when 'meal_plan' then 'meal_plans'
    when 'grocery_item' then 'grocery_items'
    else null
  end;

  if target_table is null then
    raise exception 'Unsupported Orbit tagging target type: %', new.target_type
      using errcode = '23514';
  end if;

  select exists (
    select 1 from public.tags
    where id = new.tag_id and user_id = new.user_id
  )
    into tag_exists;

  if not tag_exists then
    raise exception 'tag_id must reference a tag owned by the same user'
      using errcode = '23503';
  end if;

  execute format('select exists (select 1 from public.%I where id = $1 and user_id = $2)', target_table)
    using new.target_id, new.user_id
    into target_exists;

  if not target_exists then
    raise exception 'target_id must reference a % row owned by the same user', target_table
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_reminders_task_owner on public.reminders;
create trigger ensure_reminders_task_owner
before insert or update of user_id, task_id on public.reminders
for each row execute function public.ensure_orbit_same_owner_reference('task_id', 'tasks');

drop trigger if exists ensure_attachments_capture_owner on public.attachments;
create trigger ensure_attachments_capture_owner
before insert or update of user_id, capture_id on public.attachments
for each row execute function public.ensure_orbit_same_owner_reference('capture_id', 'captures');

drop trigger if exists ensure_focus_sessions_task_owner on public.focus_sessions;
create trigger ensure_focus_sessions_task_owner
before insert or update of user_id, task_id on public.focus_sessions
for each row execute function public.ensure_orbit_same_owner_reference('task_id', 'tasks');

drop trigger if exists ensure_grocery_items_meal_plan_owner on public.grocery_items;
create trigger ensure_grocery_items_meal_plan_owner
before insert or update of user_id, meal_plan_id on public.grocery_items
for each row execute function public.ensure_orbit_same_owner_reference('meal_plan_id', 'meal_plans');

drop trigger if exists ensure_habit_logs_habit_owner on public.habit_logs;
create trigger ensure_habit_logs_habit_owner
before insert or update of user_id, habit_id on public.habit_logs
for each row execute function public.ensure_orbit_same_owner_reference('habit_id', 'habits');

drop trigger if exists ensure_goal_milestones_goal_owner on public.goal_milestones;
create trigger ensure_goal_milestones_goal_owner
before insert or update of user_id, goal_id on public.goal_milestones
for each row execute function public.ensure_orbit_same_owner_reference('goal_id', 'goals');

drop trigger if exists ensure_taggings_same_owner on public.taggings;
create trigger ensure_taggings_same_owner
before insert or update of user_id, tag_id, target_type, target_id on public.taggings
for each row execute function public.ensure_orbit_tagging_same_owner();
