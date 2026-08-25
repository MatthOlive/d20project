-- LANCER Phase 6: pending decisions, advanced equipment/effects and source-state transactions.

create table if not exists public.lancer_pending_combat_effects (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lancer_combat_sessions(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  source_entity_id uuid not null references public.lancer_entities(id) on delete cascade,
  target_entity_id uuid not null references public.lancer_entities(id) on delete cascade,
  transaction_id uuid not null references public.lancer_combat_transactions(id) on delete cascade,
  effect_kind text not null check (effect_kind in ('manual_damage', 'optional_effect')),
  payload jsonb not null default '{}'::jsonb,
  proposed_state jsonb,
  expected_revision bigint not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected', 'expired')),
  created_by uuid not null references auth.users(id) on delete restrict,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint lancer_pending_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint lancer_pending_proposed_state_object check (proposed_state is null or jsonb_typeof(proposed_state) = 'object')
);

create index if not exists lancer_pending_effects_game_status_idx
  on public.lancer_pending_combat_effects(game_id, status, created_at desc);

alter table public.lancer_pending_combat_effects enable row level security;

drop policy if exists "members view lancer pending combat effects" on public.lancer_pending_combat_effects;
create policy "members view lancer pending combat effects"
  on public.lancer_pending_combat_effects for select to authenticated
  using (
    public.is_game_member(game_id, auth.uid())
    or public.is_game_narrator(game_id, auth.uid())
  );

drop policy if exists "controllers resolve lancer pending combat effects" on public.lancer_pending_combat_effects;
create policy "controllers resolve lancer pending combat effects"
  on public.lancer_pending_combat_effects for update to authenticated
  using (
    public.is_game_narrator(game_id, auth.uid())
    or public.can_control_lancer_entity(target_entity_id, auth.uid())
  )
  with check (
    public.is_game_narrator(game_id, auth.uid())
    or public.can_control_lancer_entity(target_entity_id, auth.uid())
  );

drop function if exists public.commit_lancer_attack(uuid, uuid, uuid, bigint, bigint, text, jsonb, jsonb, jsonb, boolean);

create or replace function public.commit_lancer_attack(
  p_session_id uuid,
  p_source_entity_id uuid,
  p_target_entity_id uuid,
  p_source_expected_revision bigint,
  p_target_expected_revision bigint,
  p_action_id text,
  p_resolution jsonb,
  p_source_next_state jsonb,
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
  v_optional_effects jsonb;
begin
  if p_source_entity_id = p_target_entity_id then raise exception 'Self attacks are not supported by this transaction' using errcode = '22023'; end if;
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
  if jsonb_typeof(p_next_action_economy) <> 'object' then raise exception 'Invalid action economy state' using errcode = '22023'; end if;
  if jsonb_typeof(p_source_next_state) <> 'object'
     or p_source_next_state ->> 'kind' <> v_source.entity_type
     or coalesce((p_source_next_state ->> 'schemaVersion')::integer, 0) <> 1 then
    raise exception 'Invalid source canonical state' using errcode = '22023';
  end if;
  if jsonb_typeof(p_target_next_state) <> 'object'
     or p_target_next_state ->> 'kind' <> v_target.entity_type
     or coalesce((p_target_next_state ->> 'schemaVersion')::integer, 0) <> 1 then
    raise exception 'Invalid target canonical state' using errcode = '22023';
  end if;

  select auto_apply_damage into v_auto_apply from public.lancer_campaigns where game_id = v_session.game_id;
  v_auto_apply := coalesce(v_auto_apply, true) and p_apply_damage;
  v_optional_effects := coalesce(p_resolution -> 'optionalEffects', '[]'::jsonb);

  insert into public.lancer_combat_transactions (
    game_id, actor_user_id, action_type, action_payload, before_state, after_state, generated_events
  ) values (
    v_session.game_id,
    v_user,
    'attack_resolved',
    p_resolution,
    jsonb_build_object('source', v_source.current_state, 'target', v_target.current_state, 'sourceRevision', v_source.revision, 'targetRevision', v_target.revision),
    jsonb_build_object('source', p_source_next_state, 'target', case when v_auto_apply then p_target_next_state else v_target.current_state end, 'sourceRevision', v_source.revision + 1, 'targetRevision', v_target.revision + case when v_auto_apply then 1 else 0 end),
    jsonb_build_array(jsonb_build_object('type', 'attack_card', 'payload', p_resolution))
  ) returning id into v_transaction_id;

  update public.lancer_entities
  set current_state = p_source_next_state, revision = revision + 1, updated_at = now()
  where id = p_source_entity_id;

  if v_auto_apply then
    update public.lancer_entities
    set current_state = p_target_next_state, revision = revision + 1, updated_at = now()
    where id = p_target_entity_id returning * into v_target_after;
  else
    v_target_after := v_target;
    if p_target_next_state is distinct from v_target.current_state then
      insert into public.lancer_pending_combat_effects (
        session_id, game_id, source_entity_id, target_entity_id, transaction_id,
        effect_kind, payload, proposed_state, expected_revision, created_by
      ) values (
        p_session_id, v_session.game_id, p_source_entity_id, p_target_entity_id, v_transaction_id,
        'manual_damage', jsonb_build_object('actionId', p_action_id, 'resolution', p_resolution),
        p_target_next_state, v_target.revision, v_user
      );
    end if;
  end if;

  if jsonb_typeof(v_optional_effects) = 'array' and jsonb_array_length(v_optional_effects) > 0 then
    insert into public.lancer_pending_combat_effects (
      session_id, game_id, source_entity_id, target_entity_id, transaction_id,
      effect_kind, payload, proposed_state, expected_revision, created_by
    ) values (
      p_session_id, v_session.game_id, p_source_entity_id, p_target_entity_id, v_transaction_id,
      'optional_effect', jsonb_build_object('actionId', p_action_id, 'effects', v_optional_effects),
      null, v_target.revision + case when v_auto_apply then 1 else 0 end, v_user
    );
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

create or replace function public.resolve_lancer_pending_combat_effect(
  p_pending_id uuid,
  p_apply boolean,
  p_expected_revision bigint,
  p_next_state jsonb default null
)
returns public.lancer_pending_combat_effects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pending public.lancer_pending_combat_effects;
  v_target public.lancer_entities;
  v_state jsonb;
begin
  select * into v_pending from public.lancer_pending_combat_effects where id = p_pending_id for update;
  if not found then raise exception 'Pending combat effect not found' using errcode = 'P0002'; end if;
  if v_pending.status <> 'pending' then raise exception 'Pending combat effect was already resolved' using errcode = '22023'; end if;
  if not public.is_game_narrator(v_pending.game_id, v_user)
     and not public.can_control_lancer_entity(v_pending.target_entity_id, v_user) then
    raise exception 'You cannot resolve this effect' using errcode = '42501';
  end if;
  select * into v_target from public.lancer_entities where id = v_pending.target_entity_id for update;
  if v_target.revision <> p_expected_revision then raise exception 'Entity changed; reload and try again' using errcode = '40001'; end if;

  if p_apply then
    v_state := coalesce(p_next_state, v_pending.proposed_state);
    if jsonb_typeof(v_state) <> 'object'
       or v_state ->> 'kind' <> v_target.entity_type
       or coalesce((v_state ->> 'schemaVersion')::integer, 0) <> 1 then
      raise exception 'Invalid resolved canonical state' using errcode = '22023';
    end if;
    update public.lancer_entities set current_state = v_state, revision = revision + 1, updated_at = now()
    where id = v_target.id;
  end if;

  update public.lancer_pending_combat_effects
  set status = case when p_apply then 'applied' else 'rejected' end,
      resolved_by = v_user,
      resolved_at = now()
  where id = p_pending_id returning * into v_pending;
  insert into public.lancer_game_events (game_id, entity_id, actor_user_id, transaction_id, event_type, payload)
  values (v_pending.game_id, v_pending.target_entity_id, v_user, v_pending.transaction_id, 'pending_effect_resolved', jsonb_build_object('pendingId', v_pending.id, 'kind', v_pending.effect_kind, 'applied', p_apply));
  return v_pending;
end;
$$;

revoke all on function public.commit_lancer_attack(uuid, uuid, uuid, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.commit_lancer_attack(uuid, uuid, uuid, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb, boolean) to authenticated;
revoke all on function public.resolve_lancer_pending_combat_effect(uuid, boolean, bigint, jsonb) from public, anon;
grant execute on function public.resolve_lancer_pending_combat_effect(uuid, boolean, bigint, jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lancer_pending_combat_effects'
  ) then alter publication supabase_realtime add table public.lancer_pending_combat_effects; end if;
end $$;

alter table public.lancer_pending_combat_effects replica identity full;
