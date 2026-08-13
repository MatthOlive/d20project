-- Pokemon Classic mode, phase 2: explorable world and route encounters.

alter table public.classic_player_progress
  add column if not exists world_scene text not null default 'bedroom',
  add column if not exists tile_x integer not null default 6,
  add column if not exists tile_y integer not null default 5,
  add column if not exists facing text not null default 'down';

alter table public.classic_player_progress
  drop constraint if exists classic_player_progress_world_scene_check;

alter table public.classic_player_progress
  add constraint classic_player_progress_world_scene_check
  check (world_scene in ('bedroom', 'pallet', 'lab', 'route_1'));

alter table public.classic_player_progress
  drop constraint if exists classic_player_progress_facing_check;

alter table public.classic_player_progress
  add constraint classic_player_progress_facing_check
  check (facing in ('up', 'down', 'left', 'right'));

create table if not exists public.classic_encounters (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scene text not null default 'route_1',
  species_id uuid not null references public.species(id),
  rank public.pokerole_rank not null default 'starter',
  tile_x integer not null,
  tile_y integer not null,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.classic_encounters
  drop constraint if exists classic_encounters_status_check;

alter table public.classic_encounters
  add constraint classic_encounters_status_check
  check (status in ('pending', 'resolved', 'fled'));

alter table public.classic_encounters enable row level security;

drop policy if exists "classic encounters visible to members" on public.classic_encounters;
create policy "classic encounters visible to members"
  on public.classic_encounters for select to authenticated
  using (public.is_game_member(game_id, auth.uid()) or public.is_game_narrator(game_id, auth.uid()));

drop policy if exists "players create own classic encounters" on public.classic_encounters;
create policy "players create own classic encounters"
  on public.classic_encounters for insert to authenticated
  with check (user_id = auth.uid() and public.is_game_member(game_id, auth.uid()));

drop policy if exists "players update own classic encounters" on public.classic_encounters;
create policy "players update own classic encounters"
  on public.classic_encounters for update to authenticated
  using (user_id = auth.uid() or public.is_game_narrator(game_id, auth.uid()))
  with check (user_id = auth.uid() or public.is_game_narrator(game_id, auth.uid()));

drop policy if exists "players delete own classic encounters" on public.classic_encounters;
create policy "players delete own classic encounters"
  on public.classic_encounters for delete to authenticated
  using (user_id = auth.uid() or public.is_game_narrator(game_id, auth.uid()));

grant select, insert, update, delete on public.classic_encounters to authenticated;

create index if not exists classic_progress_scene_idx
  on public.classic_player_progress(game_id, world_scene);

create index if not exists classic_encounters_game_idx
  on public.classic_encounters(game_id, scene, status);

create unique index if not exists classic_encounters_one_pending_per_player_idx
  on public.classic_encounters(game_id, user_id)
  where status = 'pending';
