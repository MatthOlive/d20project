-- LANCER Phase 5: combat sessions, action economy and atomic attack transactions.

create table if not exists public.lancer_combat_sessions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  map_id uuid references public.lancer_maps(id) on delete set null,
  status text not null default 'setup' check (status in ('setup', 'active', 'complete')),
  round integer not null default 1 check (round >= 1),
  current_side text not null default 'player' check (current_side in ('player', 'hostile')),
  active_participant_id uuid,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lancer_combat_session_settings_object check (jsonb_typeof(settings) = 'object')
);

create unique index if not exists lancer_one_open_combat_per_game_idx
  on public.lancer_combat_sessions(game_id) where status in ('setup', 'active');

create table if not exists public.lancer_combat_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lancer_combat_sessions(id) on delete cascade,
  entity_id uuid not null references public.lancer_entities(id) on delete cascade,
  token_id uuid references public.lancer_map_tokens(id) on delete set null,
  side text not null check (side in ('player', 'hostile')),
  has_activated boolean not null default false,
  defeated boolean not null default false,
  action_economy jsonb not null default '{
    "quickActionsRemaining": 2,
    "standardMoveAvailable": true,
    "reactionAvailable": true,
    "overchargeAvailable": true,
    "overchargeCount": 0,
    "usedActionIds": []
  }'::jsonb,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, entity_id),
  constraint lancer_participant_action_economy_object check (jsonb_typeof(action_economy) = 'object')
);

alter table public.lancer_combat_sessions
  drop constraint if exists lancer_combat_sessions_active_participant_id_fkey;
alter table public.lancer_combat_sessions
  add constraint lancer_combat_sessions_active_participant_id_fkey
  foreign key (active_participant_id) references public.lancer_combat_participants(id) on delete set null;

create index if not exists lancer_combat_participants_session_side_idx
  on public.lancer_combat_participants(session_id, side, has_activated);

alter table public.lancer_combat_sessions enable row level security;
alter table public.lancer_combat_participants enable row level security;

drop policy if exists "members view lancer combat sessions" on public.lancer_combat_sessions;
create policy "members view lancer combat sessions"
  on public.lancer_combat_sessions for select to authenticated
  using (
    public.is_game_member(game_id, auth.uid())
    or public.is_game_narrator(game_id, auth.uid())
  );

drop policy if exists "narrator manages lancer combat sessions" on public.lancer_combat_sessions;
create policy "narrator manages lancer combat sessions"
  on public.lancer_combat_sessions for all to authenticated
  using (public.is_game_narrator(game_id, auth.uid()))
  with check (public.is_game_narrator(game_id, auth.uid()));

drop policy if exists "members view lancer combat participants" on public.lancer_combat_participants;
create policy "members view lancer combat participants"
  on public.lancer_combat_participants for select to authenticated
  using (
    exists (
      select 1 from public.lancer_combat_sessions session
      where session.id = session_id
        and (
          public.is_game_member(session.game_id, auth.uid())
          or public.is_game_narrator(session.game_id, auth.uid())
        )
    )
  );

create or replace function public.start_lancer_combat(
  p_game_id uuid,
  p_map_id uuid,
  p_entity_ids uuid[]
)
returns public.lancer_combat_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session public.lancer_combat_sessions;
  v_entity_id uuid;
  v_entity public.lancer_entities;
  v_token_id uuid;
begin
  if v_user is null or not public.is_game_narrator(p_game_id, v_user) then
    raise exception 'Only the GM may start combat' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lancer_maps where id = p_map_id and game_id = p_game_id) then
    raise exception 'Map does not belong to campaign' using errcode = '23503';
  end if;
  if coalesce(array_length(p_entity_ids, 1), 0) = 0 then
    raise exception 'Combat needs at least one participant' using errcode = '22023';
  end if;

  insert into public.lancer_combat_sessions (
    game_id, map_id, status, round, current_side, created_by, started_at
  ) values (
    p_game_id, p_map_id, 'active', 1, 'player', v_user, now()
  ) returning * into v_session;

  foreach v_entity_id in array p_entity_ids
  loop
    select * into v_entity from public.lancer_entities where id = v_entity_id and game_id = p_game_id;
    if not found then raise exception 'Combat entity does not belong to campaign' using errcode = '23503'; end if;
    select id into v_token_id from public.lancer_map_tokens where map_id = p_map_id and entity_id = v_entity_id;
    insert into public.lancer_combat_participants (
      session_id, entity_id, token_id, side
    ) values (
      v_session.id,
      v_entity_id,
      v_token_id,
      case when v_entity.entity_type = 'npc' then 'hostile' else 'player' end
    );
  end loop;

  insert into public.lancer_game_events (
    game_id, actor_user_id, event_type, payload
  ) values (
    p_game_id, v_user, 'combat_started',
    jsonb_build_object('sessionId', v_session.id, 'mapId', p_map_id, 'participants', to_jsonb(p_entity_ids), 'round', 1)
  );
  return v_session;
end;
$$;

create or replace function public.activate_lancer_participant(
  p_participant_id uuid
)
returns public.lancer_combat_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_participant public.lancer_combat_participants;
  v_session public.lancer_combat_sessions;
begin
  select * into v_participant from public.lancer_combat_participants where id = p_participant_id for update;
  if not found then raise exception 'Combat participant not found' using errcode = 'P0002'; end if;
  select * into v_session from public.lancer_combat_sessions where id = v_participant.session_id for update;
  if v_session.status <> 'active' then raise exception 'Combat is not active' using errcode = '22023'; end if;
  if v_session.active_participant_id is not null then raise exception 'Another participant is already active' using errcode = '55000'; end if;
  if v_participant.has_activated or v_participant.defeated then raise exception 'Participant cannot activate now' using errcode = '22023'; end if;
  if v_participant.side <> v_session.current_side and exists (
    select 1 from public.lancer_combat_participants
    where session_id = v_session.id and side = v_session.current_side and not has_activated and not defeated
  ) then
    raise exception 'The other side must activate next' using errcode = '22023';
  end if;
  if not public.can_control_lancer_entity(v_participant.entity_id, v_user) then
    raise exception 'You do not control this participant' using errcode = '42501';
  end if;

  update public.lancer_combat_participants
  set action_economy = jsonb_build_object(
        'quickActionsRemaining', 2,
        'standardMoveAvailable', true,
        'reactionAvailable', true,
        'overchargeAvailable', true,
        'overchargeCount', coalesce((action_economy ->> 'overchargeCount')::integer, 0),
        'usedActionIds', '[]'::jsonb
      ),
      updated_at = now()
  where id = p_participant_id;

  update public.lancer_combat_sessions
  set active_participant_id = p_participant_id,
      updated_at = now()
  where id = v_session.id
  returning * into v_session;

  insert into public.lancer_game_events (game_id, entity_id, actor_user_id, event_type, payload)
  values (v_session.game_id, v_participant.entity_id, v_user, 'turn_started', jsonb_build_object('sessionId', v_session.id, 'round', v_session.round, 'side', v_participant.side));
  return v_session;
end;
$$;

create or replace function public.end_lancer_turn(
  p_participant_id uuid
)
returns public.lancer_combat_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_participant public.lancer_combat_participants;
  v_session public.lancer_combat_sessions;
  v_next_side text;
  v_round_complete boolean;
begin
  select * into v_participant from public.lancer_combat_participants where id = p_participant_id for update;
  if not found then raise exception 'Combat participant not found' using errcode = 'P0002'; end if;
  select * into v_session from public.lancer_combat_sessions where id = v_participant.session_id for update;
  if v_session.active_participant_id <> p_participant_id then raise exception 'Participant is not active' using errcode = '22023'; end if;
  if not public.can_control_lancer_entity(v_participant.entity_id, v_user) then
    raise exception 'You do not control this participant' using errcode = '42501';
  end if;

  update public.lancer_combat_participants set has_activated = true, updated_at = now() where id = p_participant_id;
  v_next_side := case when v_participant.side = 'player' then 'hostile' else 'player' end;
  if not exists (
    select 1 from public.lancer_combat_participants
    where session_id = v_session.id and side = v_next_side and not has_activated and not defeated
  ) then
    v_next_side := v_participant.side;
  end if;

  select not exists (
    select 1 from public.lancer_combat_participants
    where session_id = v_session.id and not has_activated and not defeated and id <> p_participant_id
  ) into v_round_complete;
  if v_round_complete then
    update public.lancer_combat_participants
    set has_activated = false,
        action_economy = jsonb_set(action_economy, '{reactionAvailable}', 'true'::jsonb),
        updated_at = now()
    where session_id = v_session.id and not defeated;
    v_next_side := 'player';
  end if;

  update public.lancer_combat_sessions
  set active_participant_id = null,
      current_side = v_next_side,
      round = case when v_round_complete then round + 1 else round end,
      updated_at = now()
  where id = v_session.id
  returning * into v_session;

  insert into public.lancer_game_events (game_id, entity_id, actor_user_id, event_type, payload)
  values (v_session.game_id, v_participant.entity_id, v_user, 'turn_ended', jsonb_build_object('sessionId', v_session.id, 'round', v_session.round, 'nextSide', v_next_side));
  return v_session;
end;
$$;

create or replace function public.commit_lancer_attack(
  p_session_id uuid,
  p_source_entity_id uuid,
  p_target_entity_id uuid,
  p_source_expected_revision bigint,
  p_target_expected_revision bigint,
  p_action_id text,
  p_resolution jsonb,
  p_target_next_state jsonb,
  p_next_action_economy jsonb,
  p_apply_damage boolean
)
returns public.lancer_entities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session public.lancer_combat_sessions;
  v_source public.lancer_entities;
  v_target public.lancer_entities;
  v_source_participant public.lancer_combat_participants;
  v_target_after public.lancer_entities;
  v_transaction_id uuid;
  v_auto_apply boolean;
begin
  select * into v_session from public.lancer_combat_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'active' then raise exception 'Combat is not active' using errcode = '22023'; end if;
  select * into v_source from public.lancer_entities where id = p_source_entity_id for update;
  select * into v_target from public.lancer_entities where id = p_target_entity_id for update;
  if v_source.game_id <> v_session.game_id or v_target.game_id <> v_session.game_id then
    raise exception 'Combat entities do not belong to session' using errcode = '23503';
  end if;
  if not public.can_control_lancer_entity(p_source_entity_id, v_user) then
    raise exception 'You do not control the attacker' using errcode = '42501';
  end if;
  select * into v_source_participant from public.lancer_combat_participants
  where session_id = p_session_id and entity_id = p_source_entity_id for update;
  if not found or v_session.active_participant_id <> v_source_participant.id then
    raise exception 'Attacker is not the active participant' using errcode = '22023';
  end if;
  if v_source.revision <> p_source_expected_revision or v_target.revision <> p_target_expected_revision then
    raise exception 'Entity changed; reload and try again' using errcode = '40001';
  end if;
  if jsonb_typeof(p_resolution) <> 'object'
     or p_resolution ->> 'sourceEntityId' <> p_source_entity_id::text
     or p_resolution ->> 'targetEntityId' <> p_target_entity_id::text
     or p_resolution ->> 'actionId' <> p_action_id then
    raise exception 'Invalid attack resolution' using errcode = '22023';
  end if;
  if jsonb_typeof(p_next_action_economy) <> 'object' then
    raise exception 'Invalid action economy state' using errcode = '22023';
  end if;
  if jsonb_typeof(p_target_next_state) <> 'object'
     or p_target_next_state ->> 'kind' <> v_target.entity_type
     or coalesce((p_target_next_state ->> 'schemaVersion')::integer, 0) <> 1 then
    raise exception 'Invalid target canonical state' using errcode = '22023';
  end if;

  select auto_apply_damage into v_auto_apply from public.lancer_campaigns where game_id = v_session.game_id;
  v_auto_apply := coalesce(v_auto_apply, true) and p_apply_damage;

  insert into public.lancer_combat_transactions (
    game_id, actor_user_id, action_type, action_payload, before_state, after_state, generated_events
  ) values (
    v_session.game_id,
    v_user,
    'attack_resolved',
    p_resolution,
    jsonb_build_object('source', v_source.current_state, 'target', v_target.current_state, 'sourceRevision', v_source.revision, 'targetRevision', v_target.revision),
    jsonb_build_object('source', v_source.current_state, 'target', case when v_auto_apply then p_target_next_state else v_target.current_state end, 'sourceRevision', v_source.revision, 'targetRevision', v_target.revision + case when v_auto_apply then 1 else 0 end),
    jsonb_build_array(jsonb_build_object('type', 'attack_card', 'payload', p_resolution))
  ) returning id into v_transaction_id;

  if v_auto_apply then
    update public.lancer_entities
    set current_state = p_target_next_state, revision = revision + 1, updated_at = now()
    where id = p_target_entity_id returning * into v_target_after;
  else
    v_target_after := v_target;
  end if;
  update public.lancer_combat_participants
  set action_economy = p_next_action_economy, updated_at = now()
  where id = v_source_participant.id;

  insert into public.lancer_game_events (
    game_id, entity_id, actor_user_id, transaction_id, event_type, payload
  ) values (
    v_session.game_id, p_source_entity_id, v_user, v_transaction_id, 'attack_card',
    p_resolution || jsonb_build_object('autoApplied', v_auto_apply, 'transactionId', v_transaction_id)
  );
  return v_target_after;
end;
$$;

create or replace function public.end_lancer_combat(p_session_id uuid)
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
  if not public.is_game_narrator(v_session.game_id, v_user) then raise exception 'Only the GM may end combat' using errcode = '42501'; end if;
  update public.lancer_combat_sessions
  set status = 'complete', active_participant_id = null, ended_at = now(), updated_at = now()
  where id = p_session_id returning * into v_session;
  insert into public.lancer_game_events (game_id, actor_user_id, event_type, payload)
  values (v_session.game_id, v_user, 'combat_ended', jsonb_build_object('sessionId', p_session_id, 'round', v_session.round));
  return v_session;
end;
$$;

revoke all on function public.start_lancer_combat(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.activate_lancer_participant(uuid) from public, anon;
revoke all on function public.end_lancer_turn(uuid) from public, anon;
revoke all on function public.commit_lancer_attack(uuid, uuid, uuid, bigint, bigint, text, jsonb, jsonb, jsonb, boolean) from public, anon;
revoke all on function public.end_lancer_combat(uuid) from public, anon;
grant execute on function public.start_lancer_combat(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.activate_lancer_participant(uuid) to authenticated;
grant execute on function public.end_lancer_turn(uuid) to authenticated;
grant execute on function public.commit_lancer_attack(uuid, uuid, uuid, bigint, bigint, text, jsonb, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.end_lancer_combat(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lancer_combat_sessions'
  ) then alter publication supabase_realtime add table public.lancer_combat_sessions; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lancer_combat_participants'
  ) then alter publication supabase_realtime add table public.lancer_combat_participants; end if;
end $$;

alter table public.lancer_combat_sessions replica identity full;
alter table public.lancer_combat_participants replica identity full;
