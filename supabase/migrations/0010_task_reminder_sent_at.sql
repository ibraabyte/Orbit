alter table public.tasks
  add column if not exists reminder_sent_at timestamptz;

create index if not exists tasks_due_reminders_idx
  on public.tasks(status, reminder_at)
  where reminder_at is not null and reminder_sent_at is null;
