-- LANCER Phase 4: authoritative pointy-top hex maps, terrain and entity-linked tokens.
-- Tokens only store presentation and position; all combat state remains on lancer_entities.

create table if not exists public.lancer_maps (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null default 'Operation Map',
  is_active boolean not null default false,
  hex_size integer not null default 36 check (hex_size between 16 and 128),
  q_min integer not null default 0,
  q_max integer not null default 23,
  r_min integer not null default 0,
  r_max integer not null default 17,
  background_url text,
  background_settings jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lancer_map_valid_bounds check (q_min <= q_max and r_min <= r_max),
  constraint lancer_map_background_settings_object check (jsonb_typeof(background_settings) = 'object')
);

create unique index if not exists lancer_maps_one_active_per_game_idx
  on public.lancer_maps(game_id) where is_active;
create index if not exists lancer_maps_game_created_idx
  on public.lancer_maps(game_id, created_at);

create table if not exists public.lancer_map_hexes (
  map_id uuid not null references public.lancer_maps(id) on delete cascade,
  q integer not null,
  r integer not null,
  terrain_type text not null default 'normal'
    check (terrain_type in ('normal', 'difficult', 'dangerous', 'obstruction', 'cover', 'custom')),
  movement_cost numeric(6,2) not null default 1 check (movement_cost >= 1 and movement_cost <= 100),
  blocks_movement boolean not null default false,
  blocks_los boolean not null default false,
  cover smallint not null default 0 check (cover between 0 and 2),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (map_id, q, r),
  constraint lancer_map_hex_data_object check (jsonb_typeof(data) = 'object')
);

create table if not exists public.lancer_map_tokens (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.lancer_maps(id) on delete cascade,
  entity_id uuid not null references public.lancer_entities(id) on delete cascade,
  q integer not null,
  r integer not null,
  rotation numeric(8,3) not null default 0,
  hidden boolean not null default false,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (map_id, entity_id),
  unique (map_id, q, r)
);

create index if not exists lancer_map_tokens_entity_idx
  on public.lancer_map_tokens(entity_id);

alter table public.lancer_maps enable row level security;
alter table public.lancer_map_hexes enable row level security;
alter table public.lancer_map_tokens enable row level security;

drop policy if exists "members view lancer maps" on public.lancer_maps;
create policy "members view lancer maps"
  on public.lancer_maps for select to authenticated
  using (
    public.is_game_member(game_id, auth.uid())
    or public.is_game_narrator(game_id, auth.uid())
  );

drop policy if exists "narrator manages lancer maps" on public.lancer_maps;
create policy "narrator manages lancer maps"
  on public.lancer_maps for all to authenticated
  using (public.is_game_narrator(game_id, auth.uid()))
  with check (public.is_game_narrator(game_id, auth.uid()));

drop policy if exists "members view lancer map hexes" on public.lancer_map_hexes;
create policy "members view lancer map hexes"
  on public.lancer_map_hexes for select to authenticated
  using (
    exists (
      select 1 from public.lancer_maps map
      where map.id = map_id
        and (
          public.is_game_member(map.game_id, auth.uid())
          or public.is_game_narrator(map.game_id, auth.uid())
        )
    )
  );

drop policy if exists "narrator manages lancer map hexes" on public.lancer_map_hexes;
create policy "narrator manages lancer map hexes"
  on public.lancer_map_hexes for all to authenticated
  using (
    exists (
      select 1 from public.lancer_maps map
      where map.id = map_id and public.is_game_narrator(map.game_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.lancer_maps map
      where map.id = map_id and public.is_game_narrator(map.game_id, auth.uid())
    )
  );

drop policy if exists "members view lancer map tokens" on public.lancer_map_tokens;
create policy "members view lancer map tokens"
  on public.lancer_map_tokens for select to authenticated
  using (
    exists (
      select 1 from public.lancer_maps map
      where map.id = map_id
        and (
          public.is_game_member(map.game_id, auth.uid())
          or public.is_game_narrator(map.game_id, auth.uid())
        )
    )
  );

create or replace function public.ensure_lancer_default_map()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_narrator uuid;
begin
  select narrator_id into v_narrator from public.games where id = new.game_id;
  if v_narrator is not null and not exists (
    select 1 from public.lancer_maps where game_id = new.game_id
  ) then
    insert into public.lancer_maps (game_id, name, is_active, created_by)
    values (new.game_id, 'Operation Map', true, v_narrator);
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_lancer_default_map_after_campaign on public.lancer_campaigns;
create trigger ensure_lancer_default_map_after_campaign
after insert on public.lancer_campaigns
for each row execute function public.ensure_lancer_default_map();

insert into public.lancer_maps (game_id, name, is_active, created_by)
select campaign.game_id, 'Operation Map', true, game.narrator_id
from public.lancer_campaigns campaign
join public.games game on game.id = campaign.game_id
where not exists (
  select 1 from public.lancer_maps map where map.game_id = campaign.game_id
);

create or replace function public.place_lancer_token(
  p_map_id uuid,
  p_entity_id uuid,
  p_q integer,
  p_r integer
)
returns public.lancer_map_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_map public.lancer_maps;
  v_entity public.lancer_entities;
  v_token public.lancer_map_tokens;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_map from public.lancer_maps where id = p_map_id;
  if not found then raise exception 'LANCER map not found' using errcode = 'P0002'; end if;
  select * into v_entity from public.lancer_entities where id = p_entity_id;
  if not found or v_entity.game_id <> v_map.game_id then
    raise exception 'Entity does not belong to this map' using errcode = '23503';
  end if;
  if not public.can_control_lancer_entity(p_entity_id, v_user) then
    raise exception 'You do not control this entity' using errcode = '42501';
  end if;
  if p_q < v_map.q_min or p_q > v_map.q_max or p_r < v_map.r_min or p_r > v_map.r_max then
    raise exception 'Destination is outside the map' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.lancer_map_hexes
    where map_id = p_map_id and q = p_q and r = p_r and blocks_movement
  ) then
    raise exception 'Destination blocks movement' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.lancer_map_tokens
    where map_id = p_map_id and q = p_q and r = p_r and entity_id <> p_entity_id
  ) then
    raise exception 'Destination is occupied' using errcode = '23505';
  end if;

  insert into public.lancer_map_tokens (map_id, entity_id, q, r)
  values (p_map_id, p_entity_id, p_q, p_r)
  on conflict (map_id, entity_id) do update
    set q = excluded.q,
        r = excluded.r,
        revision = public.lancer_map_tokens.revision + 1,
        updated_at = now()
  returning * into v_token;

  insert into public.lancer_game_events (
    game_id, entity_id, actor_user_id, event_type, payload
  ) values (
    v_map.game_id, p_entity_id, v_user, 'token_placed',
    jsonb_build_object('mapId', p_map_id, 'q', p_q, 'r', p_r, 'tokenRevision', v_token.revision)
  );
  return v_token;
end;
$$;

create or replace function public.move_lancer_token(
  p_token_id uuid,
  p_expected_revision bigint,
  p_q integer,
  p_r integer,
  p_path jsonb,
  p_force boolean default false
)
returns public.lancer_map_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_map public.lancer_maps;
  v_entity public.lancer_entities;
  v_before public.lancer_map_tokens;
  v_after public.lancer_map_tokens;
  v_step jsonb;
  v_previous_q integer;
  v_previous_r integer;
  v_step_q integer;
  v_step_r integer;
  v_step_index integer := 0;
  v_cost numeric := 0;
  v_speed numeric;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_before from public.lancer_map_tokens where id = p_token_id for update;
  if not found then raise exception 'LANCER token not found' using errcode = 'P0002'; end if;
  select * into v_map from public.lancer_maps where id = v_before.map_id;
  select * into v_entity from public.lancer_entities where id = v_before.entity_id;
  if not public.can_control_lancer_entity(v_before.entity_id, v_user) then
    raise exception 'You do not control this entity' using errcode = '42501';
  end if;
  if p_force and not public.is_game_narrator(v_map.game_id, v_user) then
    raise exception 'Only the GM may force movement' using errcode = '42501';
  end if;
  if v_before.revision <> p_expected_revision then
    raise exception 'Token changed; reload and try again' using errcode = '40001';
  end if;
  if jsonb_typeof(p_path) <> 'array' or jsonb_array_length(p_path) < 2 then
    raise exception 'Movement path must contain origin and destination' using errcode = '22023';
  end if;
  if p_q < v_map.q_min or p_q > v_map.q_max or p_r < v_map.r_min or p_r > v_map.r_max then
    raise exception 'Destination is outside the map' using errcode = '22023';
  end if;

  v_previous_q := v_before.q;
  v_previous_r := v_before.r;
  for v_step in select value from jsonb_array_elements(p_path)
  loop
    v_step_q := (v_step ->> 'q')::integer;
    v_step_r := (v_step ->> 'r')::integer;
    if v_step_index = 0 then
      if v_step_q <> v_before.q or v_step_r <> v_before.r then
        raise exception 'Movement path does not start at token position' using errcode = '22023';
      end if;
    else
      if greatest(
        abs(v_step_q - v_previous_q),
        abs(v_step_r - v_previous_r),
        abs((-v_step_q - v_step_r) - (-v_previous_q - v_previous_r))
      ) <> 1 then
        raise exception 'Movement path contains a non-adjacent step' using errcode = '22023';
      end if;
      if v_step_q < v_map.q_min or v_step_q > v_map.q_max
         or v_step_r < v_map.r_min or v_step_r > v_map.r_max then
        raise exception 'Movement path leaves map bounds' using errcode = '22023';
      end if;
      if exists (
        select 1 from public.lancer_map_hexes
        where map_id = v_before.map_id and q = v_step_q and r = v_step_r and blocks_movement
      ) then
        raise exception 'Movement path crosses blocked terrain' using errcode = '22023';
      end if;
      if exists (
        select 1 from public.lancer_map_tokens
        where map_id = v_before.map_id and q = v_step_q and r = v_step_r and id <> v_before.id
      ) then
        raise exception 'Movement path crosses an occupied hex' using errcode = '23505';
      end if;
      select coalesce(movement_cost, 1) into v_speed
      from public.lancer_map_hexes
      where map_id = v_before.map_id and q = v_step_q and r = v_step_r;
      v_cost := v_cost + coalesce(v_speed, 1);
    end if;
    v_previous_q := v_step_q;
    v_previous_r := v_step_r;
    v_step_index := v_step_index + 1;
  end loop;
  if v_previous_q <> p_q or v_previous_r <> p_r then
    raise exception 'Movement path does not end at destination' using errcode = '22023';
  end if;

  v_speed := coalesce((v_entity.current_state -> 'stats' ->> 'speed')::numeric, 6);
  if not p_force and v_cost > greatest(v_speed, 0) then
    raise exception 'Movement cost % exceeds speed %', v_cost, v_speed using errcode = '22023';
  end if;

  update public.lancer_map_tokens
  set q = p_q,
      r = p_r,
      revision = revision + 1,
      updated_at = now()
  where id = p_token_id
  returning * into v_after;

  insert into public.lancer_game_events (
    game_id, entity_id, actor_user_id, event_type, payload
  ) values (
    v_map.game_id, v_entity.id, v_user, 'token_moved',
    jsonb_build_object(
      'mapId', v_map.id,
      'from', jsonb_build_object('q', v_before.q, 'r', v_before.r),
      'to', jsonb_build_object('q', p_q, 'r', p_r),
      'path', p_path,
      'cost', v_cost,
      'speed', v_speed,
      'tokenRevision', v_after.revision
    )
  );
  return v_after;
end;
$$;

create or replace function public.paint_lancer_hex(
  p_map_id uuid,
  p_q integer,
  p_r integer,
  p_terrain_type text,
  p_movement_cost numeric,
  p_blocks_movement boolean,
  p_blocks_los boolean,
  p_cover smallint
)
returns public.lancer_map_hexes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_map public.lancer_maps;
  v_hex public.lancer_map_hexes;
begin
  select * into v_map from public.lancer_maps where id = p_map_id;
  if not found then raise exception 'LANCER map not found' using errcode = 'P0002'; end if;
  if v_user is null or not public.is_game_narrator(v_map.game_id, v_user) then
    raise exception 'Only the GM may edit terrain' using errcode = '42501';
  end if;
  if p_q < v_map.q_min or p_q > v_map.q_max or p_r < v_map.r_min or p_r > v_map.r_max then
    raise exception 'Hex is outside the map' using errcode = '22023';
  end if;
  if p_terrain_type not in ('normal', 'difficult', 'dangerous', 'obstruction', 'cover', 'custom') then
    raise exception 'Invalid terrain type' using errcode = '22023';
  end if;

  insert into public.lancer_map_hexes (
    map_id, q, r, terrain_type, movement_cost, blocks_movement, blocks_los, cover, updated_at
  ) values (
    p_map_id, p_q, p_r, p_terrain_type, greatest(p_movement_cost, 1),
    p_blocks_movement, p_blocks_los, greatest(0, least(p_cover, 2)), now()
  )
  on conflict (map_id, q, r) do update
    set terrain_type = excluded.terrain_type,
        movement_cost = excluded.movement_cost,
        blocks_movement = excluded.blocks_movement,
        blocks_los = excluded.blocks_los,
        cover = excluded.cover,
        updated_at = now()
  returning * into v_hex;
  return v_hex;
end;
$$;

revoke all on function public.ensure_lancer_default_map() from public, anon, authenticated;
revoke all on function public.place_lancer_token(uuid, uuid, integer, integer) from public, anon;
revoke all on function public.move_lancer_token(uuid, bigint, integer, integer, jsonb, boolean) from public, anon;
revoke all on function public.paint_lancer_hex(uuid, integer, integer, text, numeric, boolean, boolean, smallint) from public, anon;
grant execute on function public.place_lancer_token(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.move_lancer_token(uuid, bigint, integer, integer, jsonb, boolean) to authenticated;
grant execute on function public.paint_lancer_hex(uuid, integer, integer, text, numeric, boolean, boolean, smallint) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lancer_maps'
  ) then alter publication supabase_realtime add table public.lancer_maps; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lancer_map_hexes'
  ) then alter publication supabase_realtime add table public.lancer_map_hexes; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lancer_map_tokens'
  ) then alter publication supabase_realtime add table public.lancer_map_tokens; end if;
end $$;

alter table public.lancer_maps replica identity full;
alter table public.lancer_map_hexes replica identity full;
alter table public.lancer_map_tokens replica identity full;
