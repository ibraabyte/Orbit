-- Movies and series you want to watch, are watching (with the season/episode you reached), or finished.
-- Linked to TMDB ids so Seerr results and requests map onto the same rows.
create table if not exists public.watch_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null check (char_length(title) <= 300),
  poster_path text,
  status text not null default 'want' check (status in ('want', 'watching', 'done')),
  season integer check (season >= 0),
  episode integer check (episode >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, media_type, tmdb_id)
);

create index if not exists watch_items_user_status_idx on public.watch_items(user_id, status, updated_at desc);

drop trigger if exists set_watch_items_updated_at on public.watch_items;
create trigger set_watch_items_updated_at
before update on public.watch_items
for each row execute function public.set_updated_at();

alter table public.watch_items enable row level security;

create policy "watch items owner all" on public.watch_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
