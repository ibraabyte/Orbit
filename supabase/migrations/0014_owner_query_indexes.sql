create index if not exists tasks_user_created_idx on public.tasks(user_id, created_at desc);
create index if not exists reminders_user_remind_idx on public.reminders(user_id, remind_at);
create index if not exists attachments_user_created_idx on public.attachments(user_id, created_at desc);
create index if not exists taggings_user_created_idx on public.taggings(user_id, created_at desc);
create index if not exists grocery_items_user_created_idx on public.grocery_items(user_id, created_at desc);
create index if not exists people_user_updated_idx on public.people(user_id, updated_at desc);
create index if not exists goal_milestones_user_created_idx on public.goal_milestones(user_id, created_at desc);
