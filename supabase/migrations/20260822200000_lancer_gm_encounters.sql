-- LANCER Phase 7: NPC blueprints, encounter templates/instances and auditable GM tools.

create table if not exists public.lancer_npc_blueprints (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  class_item_id uuid not null references public.lancer_compendium_items(id) on delete restrict,
  tier smallint not null check (tier between 1 and 3),
  template_item_ids uuid[] not null default '{}'::uuid[],
  optional_feature_item_ids uuid[] not null default '{}'::uuid[],
  canonical_state jsonb not null,
  action_ids text[] not null default '{}'::text[],
  notes text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lancer_npc_blueprint_state_object check (
    jsonb_typeof(canonical_state) = 'object'
    and canonical_state ->> 'kind' = 'npc'
    and coalesce((canonical_state ->> 'schemaVersion')::integer, 0) = 1
  )
);

create index if not exists lancer_npc_blueprints_game_name_idx
  on public.lancer_npc_blueprints(game_id, name);

create table if not exists public.lancer_encounters (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  map_id uuid not null references public.lancer_maps(id) on delete restrict,
  sitrep_item_id uuid references public.lancer_compendium_items(id) on delete set null,
  objective jsonb not null default '{}'::jsonb,
  enemy_roster jsonb not null default '[]'::jsonb,
  reserves jsonb not null default '[]'::jsonb,
  reinforcements jsonb not null default '[]'::jsonb,
  deployment jsonb not null default '{"player":[],"enemy":[],"reserve":[]}'::jsonb,
  notes text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lancer_encounter_objective_object check (jsonb_typeof(objective) = 'object'),
  constraint lancer_encounter_roster_array check (jsonb_typeof(enemy_roster) = 'array'),
  constraint lancer_encounter_reserves_array check (jsonb_typeof(reserves) = 'array'),
  constraint lancer_encounter_reinforcements_array check (jsonb_typeof(reinforcements) = 'array'),
  constraint lancer_encounter_deployment_object check (jsonb_typeof(deployment) = 'object')
);

create index if not exists lancer_encounters_game_name_idx
  on public.lancer_encounters(game_id, name);

create table if not exists public.lancer_encounter_instances (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.lancer_encounters(id) on delete restrict,
  game_id uuid not null references public.games(id) on delete cascade,
  map_id uuid not null references public.lancer_maps(id) on delete restrict,
  combat_session_id uuid references public.lancer_combat_sessions(id) on delete set null,
  status text not null default 'setup' check (status in ('setup', 'active', 'victory', 'defeat', 'complete')),
  round integer not null default 1 check (round >= 1),
  template_snapshot jsonb not null,
  objective_state jsonb not null default '{"playerScore":0,"hostileScore":0,"completed":false}'::jsonb,
  spawned_entity_ids uuid[] not null default '{}'::uuid[],
  started_by uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lancer_encounter_instance_snapshot_object check (jsonb_typeof(template_snapshot) = 'object'),
  constraint lancer_encounter_instance_objective_object check (jsonb_typeof(objective_state) = 'object')
);

create index if not exists lancer_encounter_instances_game_status_idx
  on public.lancer_encounter_instances(game_id, status, created_at desc);

create table if not exists public.lancer_encounter_zones (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.lancer_encounters(id) on delete cascade,
  zone_type text not null check (zone_type in ('player_deployment', 'enemy_deployment', 'reserve', 'objective')),
  name text not null,
  hexes jsonb not null default '[]'::jsonb,
  color text not null default '#22d3ee',
  visible boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lancer_encounter_zone_hexes_array check (jsonb_typeof(hexes) = 'array'),
  constraint lancer_encounter_zone_data_object check (jsonb_typeof(data) = 'object')
);

create table if not exists public.lancer_manual_overrides (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  entity_id uuid not null references public.lancer_entities(id) on delete cascade,
  transaction_id uuid not null unique references public.lancer_combat_transactions(id) on delete cascade,
  reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.lancer_npc_blueprints enable row level security;
alter table public.lancer_encounters enable row level security;
alter table public.lancer_encounter_instances enable row level security;
alter table public.lancer_encounter_zones enable row level security;
alter table public.lancer_manual_overrides enable row level security;

drop policy if exists "members view lancer npc blueprints" on public.lancer_npc_blueprints;
create policy "members view lancer npc blueprints" on public.lancer_npc_blueprints
  for select to authenticated using (
    public.is_game_member(game_id, auth.uid()) or public.is_game_narrator(game_id, auth.uid())
  );
drop policy if exists "narrator manages lancer npc blueprints" on public.lancer_npc_blueprints;
create policy "narrator manages lancer npc blueprints" on public.lancer_npc_blueprints
  for all to authenticated using (public.is_game_narrator(game_id, auth.uid()))
  with check (public.is_game_narrator(game_id, auth.uid()));

drop policy if exists "members view lancer encounters" on public.lancer_encounters;
create policy "members view lancer encounters" on public.lancer_encounters
  for select to authenticated using (
    public.is_game_member(game_id, auth.uid()) or public.is_game_narrator(game_id, auth.uid())
  );
drop policy if exists "narrator manages lancer encounters" on public.lancer_encounters;
create policy "narrator manages lancer encounters" on public.lancer_encounters
  for all to authenticated using (public.is_game_narrator(game_id, auth.uid()))
  with check (public.is_game_narrator(game_id, auth.uid()));

drop policy if exists "members view lancer encounter instances" on public.lancer_encounter_instances;
create policy "members view lancer encounter instances" on public.lancer_encounter_instances
  for select to authenticated using (
    public.is_game_member(game_id, auth.uid()) or public.is_game_narrator(game_id, auth.uid())
  );
drop policy if exists "narrator manages lancer encounter instances" on public.lancer_encounter_instances;
create policy "narrator manages lancer encounter instances" on public.lancer_encounter_instances
  for all to authenticated using (public.is_game_narrator(game_id, auth.uid()))
  with check (public.is_game_narrator(game_id, auth.uid()));

drop policy if exists "members view lancer encounter zones" on public.lancer_encounter_zones;
create policy "members view lancer encounter zones" on public.lancer_encounter_zones
  for select to authenticated using (exists (
    select 1 from public.lancer_encounters encounter
    where encounter.id = encounter_id
      and (public.is_game_member(encounter.game_id, auth.uid()) or public.is_game_narrator(encounter.game_id, auth.uid()))
  ));
drop policy if exists "narrator manages lancer encounter zones" on public.lancer_encounter_zones;
create policy "narrator manages lancer encounter zones" on public.lancer_encounter_zones
  for all to authenticated using (exists (
    select 1 from public.lancer_encounters encounter
    where encounter.id = encounter_id and public.is_game_narrator(encounter.game_id, auth.uid())
  )) with check (exists (
    select 1 from public.lancer_encounters encounter
    where encounter.id = encounter_id and public.is_game_narrator(encounter.game_id, auth.uid())
  ));

drop policy if exists "members view lancer manual overrides" on public.lancer_manual_overrides;
create policy "members view lancer manual overrides" on public.lancer_manual_overrides
  for select to authenticated using (
    public.is_game_member(game_id, auth.uid()) or public.is_game_narrator(game_id, auth.uid())
  );

create or replace function public.start_lancer_encounter(p_encounter_id uuid)
returns public.lancer_encounter_instances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_encounter public.lancer_encounters;
  v_instance public.lancer_encounter_instances;
  v_session public.lancer_combat_sessions;
  v_blueprint public.lancer_npc_blueprints;
  v_entity public.lancer_entities;
  v_roster jsonb;
  v_hex jsonb;
  v_spawned uuid[] := '{}'::uuid[];
  v_count integer;
  v_index integer := 0;
  v_iteration integer;
  v_q integer;
  v_r integer;
begin
  select * into v_encounter from public.lancer_encounters where id = p_encounter_id for update;
  if not found then raise exception 'Encounter template not found' using errcode = 'P0002'; end if;
  if v_user is null or not public.is_game_narrator(v_encounter.game_id, v_user) then
    raise exception 'Only the GM may start an encounter' using errcode = '42501';
  end if;
  if exists (select 1 from public.lancer_combat_sessions where game_id = v_encounter.game_id and status in ('setup', 'active')) then
    raise exception 'Finish the current combat before starting another encounter' using errcode = '55000';
  end if;

  insert into public.lancer_encounter_instances (
    encounter_id, game_id, map_id, template_snapshot, started_by
  ) values (
    v_encounter.id,
    v_encounter.game_id,
    v_encounter.map_id,
    to_jsonb(v_encounter),
    v_user
  ) returning * into v_instance;

  for v_roster in select value from jsonb_array_elements(v_encounter.enemy_roster)
  loop
    if coalesce((v_roster ->> 'reserve')::boolean, false)
       or coalesce((v_roster ->> 'reinforcementRound')::integer, 0) > 0 then
      continue;
    end if;
    select * into v_blueprint from public.lancer_npc_blueprints
      where id = (v_roster ->> 'blueprintId')::uuid and game_id = v_encounter.game_id;
    if not found then raise exception 'An encounter NPC blueprint is unavailable' using errcode = '23503'; end if;
    v_count := greatest(1, least(coalesce((v_roster ->> 'count')::integer, 1), 50));
    for v_iteration in 1..v_count loop
      insert into public.lancer_entities (
        game_id, owner_id, entity_type, name, callsign, source_type, source_id, current_state, build_state
      ) values (
        v_encounter.game_id,
        null,
        'npc',
        case when v_count > 1 then v_blueprint.name || ' ' || v_iteration else v_blueprint.name end,
        v_blueprint.name,
        'campaign',
        v_blueprint.id::text,
        v_blueprint.canonical_state,
        '{"schemaVersion":1,"status":"valid","frameId":null,"pilotId":null,"licenseLevel":0,"mechSkills":{"hull":0,"agility":0,"systems":0,"engineering":0},"licenses":[],"talents":[],"coreBonusIds":[],"weaponIds":[],"systemIds":[],"gearIds":[],"armorIds":[],"reserveIds":[],"background":"","triggerValues":{},"mountSelections":[],"validation":{"valid":true,"errors":[]}}'::jsonb
      ) returning * into v_entity;
      v_spawned := array_append(v_spawned, v_entity.id);

      v_hex := v_encounter.deployment -> 'enemy' -> v_index;
      v_q := nullif(v_hex ->> 'q', '')::integer;
      v_r := nullif(v_hex ->> 'r', '')::integer;
      if v_q is null or v_r is null or exists (
        select 1 from public.lancer_map_tokens where map_id = v_encounter.map_id and q = v_q and r = v_r
      ) then
        select candidate.q, candidate.r into v_q, v_r
        from public.lancer_maps map
        cross join lateral generate_series(map.q_min, map.q_max) candidate_q(q)
        cross join lateral generate_series(map.r_min, map.r_max) candidate_r(r)
        cross join lateral (select candidate_q.q, candidate_r.r) candidate
        where map.id = v_encounter.map_id
          and not exists (select 1 from public.lancer_map_tokens token where token.map_id = map.id and token.q = candidate.q and token.r = candidate.r)
          and not exists (select 1 from public.lancer_map_hexes hex where hex.map_id = map.id and hex.q = candidate.q and hex.r = candidate.r and hex.blocks_movement)
        order by candidate.r, candidate.q
        limit 1;
      end if;
      if v_q is null or v_r is null then raise exception 'No free deployment hex is available' using errcode = '23505'; end if;
      insert into public.lancer_map_tokens (map_id, entity_id, q, r, hidden)
      values (v_encounter.map_id, v_entity.id, v_q, v_r, false);
      v_index := v_index + 1;
    end loop;
  end loop;

  insert into public.lancer_combat_sessions (
    game_id, map_id, status, round, current_side, settings, created_by, started_at
  ) values (
    v_encounter.game_id, v_encounter.map_id, 'active', 1, 'player',
    jsonb_build_object('encounterInstanceId', v_instance.id, 'objective', v_encounter.objective),
    v_user, now()
  ) returning * into v_session;

  insert into public.lancer_combat_participants (session_id, entity_id, token_id, side)
  select v_session.id, entity.id, token.id,
    case when entity.entity_type = 'npc' then 'hostile' else 'player' end
  from public.lancer_map_tokens token
  join public.lancer_entities entity on entity.id = token.entity_id
  where token.map_id = v_encounter.map_id
    and entity.entity_type not in ('object', 'deployable')
  on conflict (session_id, entity_id) do nothing;

  update public.lancer_encounter_instances
  set combat_session_id = v_session.id,
      status = 'active',
      spawned_entity_ids = v_spawned,
      updated_at = now()
  where id = v_instance.id
  returning * into v_instance;

  insert into public.lancer_game_events (game_id, actor_user_id, event_type, payload)
  values (
    v_encounter.game_id, v_user, 'encounter_started',
    jsonb_build_object('encounterId', v_encounter.id, 'instanceId', v_instance.id, 'sessionId', v_session.id, 'spawnedEntityIds', to_jsonb(v_spawned))
  );
  return v_instance;
end;
$$;

create or replace function public.gm_override_lancer_entity(
  p_entity_id uuid,
  p_expected_revision bigint,
  p_next_state jsonb,
  p_reason text default null
)
returns public.lancer_entities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_before public.lancer_entities;
  v_after public.lancer_entities;
  v_transaction_id uuid;
begin
  select * into v_before from public.lancer_entities where id = p_entity_id for update;
  if not found then raise exception 'LANCER entity not found' using errcode = 'P0002'; end if;
  if v_user is null or not public.is_game_narrator(v_before.game_id, v_user) then
    raise exception 'Only the GM may override state' using errcode = '42501';
  end if;
  if v_before.revision <> p_expected_revision then raise exception 'Entity changed; reload and try again' using errcode = '40001'; end if;
  if jsonb_typeof(p_next_state) <> 'object'
     or p_next_state ->> 'kind' <> v_before.entity_type
     or coalesce((p_next_state ->> 'schemaVersion')::integer, 0) <> 1 then
    raise exception 'Invalid canonical state' using errcode = '22023';
  end if;

  insert into public.lancer_combat_transactions (
    game_id, actor_user_id, action_type, action_payload, before_state, after_state, generated_events
  ) values (
    v_before.game_id, v_user, 'manual_override', jsonb_build_object('entityId', v_before.id, 'reason', nullif(btrim(coalesce(p_reason, '')), '')),
    jsonb_build_object('entityId', v_before.id, 'revision', v_before.revision, 'state', v_before.current_state),
    jsonb_build_object('entityId', v_before.id, 'revision', v_before.revision + 1, 'state', p_next_state),
    jsonb_build_array(jsonb_build_object('type', 'manual_override', 'payload', jsonb_build_object('entityId', v_before.id)))
  ) returning id into v_transaction_id;

  update public.lancer_entities set current_state = p_next_state, revision = revision + 1, updated_at = now()
  where id = v_before.id returning * into v_after;
  insert into public.lancer_manual_overrides (game_id, entity_id, transaction_id, reason, created_by)
  values (v_before.game_id, v_before.id, v_transaction_id, nullif(btrim(coalesce(p_reason, '')), ''), v_user);
  insert into public.lancer_game_events (game_id, entity_id, actor_user_id, transaction_id, event_type, payload)
  values (v_before.game_id, v_before.id, v_user, v_transaction_id, 'manual_override', jsonb_build_object('reason', p_reason, 'revision', v_after.revision));
  return v_after;
end;
$$;

create or replace function public.undo_lancer_transaction(
  p_transaction_id uuid,
  p_reason text default null
)
returns public.lancer_combat_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_original public.lancer_combat_transactions;
  v_undo public.lancer_combat_transactions;
  v_entity public.lancer_entities;
  v_source_id uuid;
  v_target_id uuid;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
begin
  select * into v_original from public.lancer_combat_transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction not found' using errcode = 'P0002'; end if;
  if v_user is null or not public.is_game_narrator(v_original.game_id, v_user) then
    raise exception 'Only the GM may undo transactions' using errcode = '42501';
  end if;
  if v_original.reversed_by is not null or v_original.action_type = 'undo' then
    raise exception 'Transaction was already reversed' using errcode = '22023';
  end if;

  if v_original.before_state ? 'entityId' then
    select * into v_entity from public.lancer_entities
      where id = (v_original.before_state ->> 'entityId')::uuid for update;
    if not found then raise exception 'Transaction entity no longer exists' using errcode = 'P0002'; end if;
    if v_entity.current_state is distinct from v_original.after_state -> 'state' then
      raise exception 'Entity changed after this transaction; use manual override instead' using errcode = '40001';
    end if;
    v_before := jsonb_build_object('entityId', v_entity.id, 'revision', v_entity.revision, 'state', v_entity.current_state);
    update public.lancer_entities set current_state = v_original.before_state -> 'state', revision = revision + 1, updated_at = now()
      where id = v_entity.id returning * into v_entity;
    v_after := jsonb_build_object('entityId', v_entity.id, 'revision', v_entity.revision, 'state', v_entity.current_state);
  elsif v_original.before_state ? 'source' and v_original.before_state ? 'target' then
    v_source_id := (v_original.action_payload ->> 'sourceEntityId')::uuid;
    v_target_id := (v_original.action_payload ->> 'targetEntityId')::uuid;
    if v_source_id is null or v_target_id is null then raise exception 'Attack transaction lacks entity references' using errcode = '22023'; end if;
    perform 1 from public.lancer_entities where id in (v_source_id, v_target_id) for update;
    if (select current_state from public.lancer_entities where id = v_source_id) is distinct from v_original.after_state -> 'source'
       or (select current_state from public.lancer_entities where id = v_target_id) is distinct from v_original.after_state -> 'target' then
      raise exception 'Combat state changed after this transaction; use manual override instead' using errcode = '40001';
    end if;
    v_before := jsonb_build_object(
      'sourceEntityId', v_source_id, 'source', (select current_state from public.lancer_entities where id = v_source_id),
      'targetEntityId', v_target_id, 'target', (select current_state from public.lancer_entities where id = v_target_id)
    );
    update public.lancer_entities set current_state = v_original.before_state -> 'source', revision = revision + 1, updated_at = now() where id = v_source_id;
    update public.lancer_entities set current_state = v_original.before_state -> 'target', revision = revision + 1, updated_at = now() where id = v_target_id;
    v_after := jsonb_build_object(
      'sourceEntityId', v_source_id, 'source', (select current_state from public.lancer_entities where id = v_source_id),
      'targetEntityId', v_target_id, 'target', (select current_state from public.lancer_entities where id = v_target_id)
    );
  else
    raise exception 'This transaction format cannot be undone safely' using errcode = '0A000';
  end if;

  insert into public.lancer_combat_transactions (
    game_id, actor_user_id, action_type, action_payload, before_state, after_state, generated_events
  ) values (
    v_original.game_id, v_user, 'undo',
    jsonb_build_object('originalTransactionId', v_original.id, 'originalActionType', v_original.action_type, 'reason', nullif(btrim(coalesce(p_reason, '')), '')),
    v_before, v_after,
    jsonb_build_array(jsonb_build_object('type', 'transaction_undone', 'payload', jsonb_build_object('transactionId', v_original.id)))
  ) returning * into v_undo;
  update public.lancer_combat_transactions set reversed_by = v_undo.id where id = v_original.id;
  insert into public.lancer_game_events (game_id, actor_user_id, transaction_id, event_type, payload)
  values (v_original.game_id, v_user, v_undo.id, 'transaction_undone', jsonb_build_object('originalTransactionId', v_original.id, 'originalActionType', v_original.action_type, 'reason', p_reason));
  return v_undo;
end;
$$;

create or replace function public.gm_advance_lancer_round(p_session_id uuid)
returns public.lancer_combat_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session public.lancer_combat_sessions;
begin
  select * into v_session from public.lancer_combat_sessions where id = p_session_id for update;
  if not found then raise exception 'Combat session not found' using errcode = 'P0002'; end if;
  if v_user is null or not public.is_game_narrator(v_session.game_id, v_user) then
    raise exception 'Only the GM may advance rounds' using errcode = '42501';
  end if;
  if v_session.status <> 'active' then raise exception 'Combat is not active' using errcode = '22023'; end if;
  update public.lancer_combat_participants
  set has_activated = false,
      action_economy = jsonb_set(action_economy, '{reactionAvailable}', 'true'::jsonb),
      updated_at = now()
  where session_id = v_session.id and not defeated;
  update public.lancer_combat_sessions
  set round = round + 1, current_side = 'player', active_participant_id = null, updated_at = now()
  where id = v_session.id returning * into v_session;
  update public.lancer_encounter_instances set round = v_session.round, updated_at = now()
  where combat_session_id = v_session.id and status = 'active';
  insert into public.lancer_game_events (game_id, actor_user_id, event_type, payload)
  values (v_session.game_id, v_user, 'round_advanced', jsonb_build_object('sessionId', v_session.id, 'round', v_session.round, 'forcedByGm', true));
  return v_session;
end;
$$;

create or replace function public.gm_finish_lancer_encounter(
  p_instance_id uuid,
  p_outcome text
)
returns public.lancer_encounter_instances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_instance public.lancer_encounter_instances;
begin
  select * into v_instance from public.lancer_encounter_instances where id = p_instance_id for update;
  if not found then raise exception 'Encounter instance not found' using errcode = 'P0002'; end if;
  if v_user is null or not public.is_game_narrator(v_instance.game_id, v_user) then
    raise exception 'Only the GM may finish an encounter' using errcode = '42501';
  end if;
  if p_outcome not in ('victory', 'defeat', 'complete') then raise exception 'Invalid encounter outcome' using errcode = '22023'; end if;
  if v_instance.combat_session_id is not null then
    update public.lancer_combat_sessions set status = 'complete', active_participant_id = null, ended_at = now(), updated_at = now()
    where id = v_instance.combat_session_id and status <> 'complete';
  end if;
  update public.lancer_encounter_instances
  set status = p_outcome,
      objective_state = objective_state || jsonb_build_object('completed', true, 'outcome', p_outcome),
      ended_at = now(),
      updated_at = now()
  where id = v_instance.id returning * into v_instance;
  insert into public.lancer_game_events (game_id, actor_user_id, event_type, payload)
  values (v_instance.game_id, v_user, 'encounter_finished', jsonb_build_object('instanceId', v_instance.id, 'outcome', p_outcome));
  return v_instance;
end;
$$;

create or replace function public.gm_set_lancer_token_hidden(
  p_entity_id uuid,
  p_hidden boolean
)
returns public.lancer_map_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_entity public.lancer_entities;
  v_token public.lancer_map_tokens;
begin
  select * into v_entity from public.lancer_entities where id = p_entity_id;
  if not found then raise exception 'LANCER entity not found' using errcode = 'P0002'; end if;
  if v_user is null or not public.is_game_narrator(v_entity.game_id, v_user) then
    raise exception 'Only the GM may hide or reveal tokens' using errcode = '42501';
  end if;
  update public.lancer_map_tokens set hidden = p_hidden, revision = revision + 1, updated_at = now()
  where entity_id = v_entity.id returning * into v_token;
  if not found then raise exception 'Entity is not placed on a map' using errcode = 'P0002'; end if;
  insert into public.lancer_game_events (game_id, entity_id, actor_user_id, event_type, payload)
  values (v_entity.game_id, v_entity.id, v_user, 'token_visibility_changed', jsonb_build_object('hidden', p_hidden, 'mapId', v_token.map_id));
  return v_token;
end;
$$;

revoke all on function public.start_lancer_encounter(uuid) from public, anon;
revoke all on function public.gm_override_lancer_entity(uuid, bigint, jsonb, text) from public, anon;
revoke all on function public.undo_lancer_transaction(uuid, text) from public, anon;
revoke all on function public.gm_advance_lancer_round(uuid) from public, anon;
revoke all on function public.gm_finish_lancer_encounter(uuid, text) from public, anon;
revoke all on function public.gm_set_lancer_token_hidden(uuid, boolean) from public, anon;
grant execute on function public.start_lancer_encounter(uuid) to authenticated;
grant execute on function public.gm_override_lancer_entity(uuid, bigint, jsonb, text) to authenticated;
grant execute on function public.undo_lancer_transaction(uuid, text) to authenticated;
grant execute on function public.gm_advance_lancer_round(uuid) to authenticated;
grant execute on function public.gm_finish_lancer_encounter(uuid, text) to authenticated;
grant execute on function public.gm_set_lancer_token_hidden(uuid, boolean) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lancer_npc_blueprints') then
    alter publication supabase_realtime add table public.lancer_npc_blueprints;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lancer_encounters') then
    alter publication supabase_realtime add table public.lancer_encounters;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lancer_encounter_instances') then
    alter publication supabase_realtime add table public.lancer_encounter_instances;
  end if;
end $$;

alter table public.lancer_npc_blueprints replica identity full;
alter table public.lancer_encounters replica identity full;
alter table public.lancer_encounter_instances replica identity full;
