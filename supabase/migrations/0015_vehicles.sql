-- Car upkeep: renewal dates (istimara, insurance, inspection / فحص) and the next oil change.
-- Service history is logged as expenses in the transport category.
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 120),
  plate text check (char_length(plate) <= 20),
  odometer_km integer check (odometer_km >= 0),
  registration_expires_at date,
  insurance_expires_at date,
  inspection_expires_at date,
  next_oil_change_at date,
  next_oil_change_km integer check (next_oil_change_km >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicles_user_idx on public.vehicles(user_id, created_at);

drop trigger if exists set_vehicles_updated_at on public.vehicles;
create trigger set_vehicles_updated_at
before update on public.vehicles
for each row execute function public.set_updated_at();

alter table public.vehicles enable row level security;

create policy "vehicles owner all" on public.vehicles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
