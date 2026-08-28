-- Idempotent Pokérole move reactions and damage application.
create table if not exists public.pokerole_combat_operations (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  source_message_id uuid not null references public.chat_messages(id) on delete cascade,
  request_id text not null,
  kind text not null check (kind in ('reaction', 'resolution')),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  chat_message_id uuid references public.chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (game_id, kind, request_id)
);

create index if not exists pokerole_combat_operations_source_idx
  on public.pokerole_combat_operations(source_message_id, kind, created_at);

alter table public.pokerole_combat_operations enable row level security;

drop policy if exists "members view pokerole combat operations" on public.pokerole_combat_operations;
create policy "members view pokerole combat operations"
  on public.pokerole_combat_operations for select to authenticated
  using (public.is_game_member(game_id, auth.uid()));

create or replace function public.apply_pokerole_character_damage(
  p_game_id uuid,
  p_character_kind text,
  p_character_id uuid,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hp integer;
  v_amount integer := greatest(0, least(coalesce(p_amount, 0), 1000));
begin
  if p_character_kind = 'pokemon' then
    if v_amount = 0 then
      select coalesce(current_hp, hp) into v_hp
      from public.pokemon where id = p_character_id and game_id = p_game_id;
    else
      update public.pokemon
      set current_hp = greatest(0, coalesce(current_hp, hp) - v_amount)
      where id = p_character_id and game_id = p_game_id
      returning current_hp into v_hp;
    end if;
  elsif p_character_kind = 'trainer' then
    if v_amount = 0 then
      select coalesce(
        current_hp,
        5 + coalesce((attr_points ->> 'vitality')::integer, 0)
          + coalesce((attr_bonus ->> 'vitality')::integer, 0)
      ) into v_hp
      from public.trainers where id = p_character_id and game_id = p_game_id;
    else
      update public.trainers
      set current_hp = greatest(
        0,
        coalesce(
          current_hp,
          5 + coalesce((attr_points ->> 'vitality')::integer, 0)
            + coalesce((attr_bonus ->> 'vitality')::integer, 0)
        ) - v_amount
      )
      where id = p_character_id and game_id = p_game_id
      returning current_hp into v_hp;
    end if;
  else
    raise exception 'Unsupported character kind' using errcode = '22023';
  end if;

  if v_hp is null then
    raise exception 'Combat target not found in this game' using errcode = 'P0002';
  end if;
  return v_hp;
end;
$$;

create or replace function public.submit_pokerole_move_reaction(
  p_game_id uuid,
  p_source_message_id uuid,
  p_response jsonb
)
returns public.chat_messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_source public.chat_messages;
  v_existing public.pokerole_combat_operations;
  v_operation public.pokerole_combat_operations;
  v_chat public.chat_messages;
  v_target jsonb;
  v_damage_target jsonb;
  v_response jsonb;
  v_request_id text;
  v_choice text;
  v_kind text;
  v_character_id uuid;
  v_pool integer;
  v_available_pool integer;
  v_successes integer;
  v_actions_before integer;
  v_required integer;
  v_damage integer := 0;
  v_succeeded boolean;
begin
  if v_user is null or not public.is_game_member(p_game_id, v_user) then
    raise exception 'You are not a member of this game' using errcode = '42501';
  end if;
  if jsonb_typeof(p_response) <> 'object'
     or coalesce(p_response ->> 'v', '') <> 'move-reaction-1'
     or jsonb_typeof(p_response -> 'dice') <> 'array' then
    raise exception 'Invalid reaction payload' using errcode = '22023';
  end if;

  select * into v_source from public.chat_messages
  where id = p_source_message_id and game_id = p_game_id
  for update;
  if not found
     or coalesce(v_source.roll_data ->> 'v', '') <> 'move-1'
     or coalesce(v_source.roll_data ->> 'phase', '') <> 'accuracy' then
    raise exception 'Move accuracy message not found' using errcode = 'P0002';
  end if;

  v_request_id := left(coalesce(p_response ->> 'requestId', ''), 200);
  if v_request_id = '' then
    raise exception 'Reaction request is required' using errcode = '22023';
  end if;

  select value into v_target
  from jsonb_array_elements(coalesce(v_source.roll_data -> 'reactionTargets', '[]'::jsonb))
  where value ->> 'requestId' = v_request_id
  limit 1;
  if v_target is null then
    raise exception 'Reaction target not found on this move' using errcode = '22023';
  end if;
  if not public.is_game_narrator(p_game_id, v_user) and not exists (
    select 1 from jsonb_array_elements_text(coalesce(v_target -> 'controllerIds', '[]'::jsonb)) as controllers(controller_id)
    where controller_id = v_user::text
  ) then
    raise exception 'You do not control this reaction target' using errcode = '42501';
  end if;

  v_choice := coalesce(p_response ->> 'choice', '');
  if v_choice not in ('none', 'clash', 'evade') then
    raise exception 'Unsupported reaction choice' using errcode = '22023';
  end if;
  v_kind := v_target ->> 'characterKind';
  begin
    v_character_id := (v_target ->> 'characterId')::uuid;
  exception when invalid_text_representation then
    raise exception 'Invalid reaction character' using errcode = '22023';
  end;
  if v_kind not in ('pokemon', 'trainer')
     or (p_response ->> 'targetCharacterId') is distinct from v_character_id::text
     or (p_response ->> 'targetCharacterKind') is distinct from v_kind then
    raise exception 'Reaction target does not match the move' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_response -> 'dice') as dice(die)
    where jsonb_typeof(die) <> 'number' or (die #>> '{}')::integer not between 1 and 6
  ) or jsonb_array_length(p_response -> 'dice') > 50 then
    raise exception 'Invalid reaction dice' using errcode = '22023';
  end if;

  v_pool := jsonb_array_length(p_response -> 'dice');
  v_available_pool := greatest(
    0,
    coalesce((v_target ->> (case when v_choice = 'clash' then 'clashPool' else 'evadePool' end))::integer, 0)
      - coalesce((v_target ->> 'painPenalty')::integer, 0)
  );
  select coalesce(max(
    case
      when coalesce(participant ->> 'actionsUsed', '') ~ '^[0-9]+$'
        then least((participant ->> 'actionsUsed')::integer, 50)
      else 0
    end
  ), 0) into v_actions_before
  from public.game_engine_sessions session
  cross join lateral jsonb_array_elements(coalesce(session.state -> 'participants', '[]'::jsonb)) as participants(participant)
  where session.game_id = p_game_id
    and session.status in ('running', 'paused')
    and (
      participant ->> 'characterId' = v_character_id::text
      or participant ->> 'tokenId' = v_target ->> 'tokenId'
    );
  v_required := greatest(0, coalesce((v_source.roll_data #>> '{accuracy,successes}')::integer, 0)) + v_actions_before;
  if (v_choice = 'none' and v_pool <> 0)
     or (v_choice <> 'none' and (v_available_pool < v_required or v_pool <> v_available_pool)) then
    raise exception 'Reaction pool is not valid for this move' using errcode = '22023';
  end if;

  select count(*)::integer into v_successes
  from jsonb_array_elements(p_response -> 'dice') as dice(die)
  where (die #>> '{}')::integer >= 4;
  v_succeeded := v_choice <> 'none' and v_successes >= v_required;

  select value into v_damage_target
  from jsonb_array_elements(coalesce(v_source.roll_data #> '{damage,targets}', '[]'::jsonb))
  where value ->> 'requestId' = v_request_id
  limit 1;
  if v_damage_target is not null then
    if coalesce((v_damage_target ->> 'immune')::boolean, false) then
      v_damage := 0;
    elsif v_succeeded and v_choice = 'evade' then
      v_damage := 0;
    elsif v_succeeded and v_choice = 'clash' then
      v_damage := 1;
    else
      v_damage := greatest(1, coalesce((v_damage_target ->> 'finalDamage')::integer, 0));
    end if;
  end if;

  v_response := p_response || jsonb_build_object(
    'resolutionId', v_source.roll_data ->> 'resolutionId',
    'requestId', v_request_id,
    'targetCharacterId', v_character_id::text,
    'targetCharacterKind', v_kind,
    'pool', v_pool,
    'successes', v_successes,
    'moveSuccesses', coalesce((v_source.roll_data #>> '{accuracy,successes}')::integer, 0),
    'actionsBefore', v_actions_before,
    'required', v_required,
    'succeeded', v_succeeded,
    'appliedDamage', v_damage,
    'attackerDamage', case when v_choice = 'clash' and v_succeeded then 1 else 0 end
  );

  insert into public.pokerole_combat_operations (
    game_id, source_message_id, request_id, kind, actor_user_id, payload
  ) values (
    p_game_id, p_source_message_id, v_request_id, 'reaction', v_user, v_response
  )
  on conflict (game_id, kind, request_id) do nothing
  returning * into v_operation;

  if v_operation.id is null then
    select * into v_existing from public.pokerole_combat_operations
    where game_id = p_game_id and kind = 'reaction' and request_id = v_request_id;
    select * into v_chat from public.chat_messages where id = v_existing.chat_message_id;
    return v_chat;
  end if;

  perform public.apply_pokerole_character_damage(p_game_id, v_kind, v_character_id, v_damage);

  insert into public.chat_messages (game_id, user_id, kind, body, roll_data)
  values (
    p_game_id,
    v_user,
    'move_reaction',
    case when v_choice = 'none'
      then coalesce(v_target ->> 'name', 'Alvo') || ' não reagiu'
      else coalesce(v_target ->> 'name', 'Alvo') || ' usou ' || case when v_choice = 'clash' then 'Clash' else 'Evade' end
    end,
    v_response
  ) returning * into v_chat;

  update public.pokerole_combat_operations set chat_message_id = v_chat.id where id = v_operation.id;
  return v_chat;
end;
$$;

create or replace function public.finalize_pokerole_move(
  p_game_id uuid,
  p_source_message_id uuid
)
returns public.chat_messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_source public.chat_messages;
  v_existing public.pokerole_combat_operations;
  v_operation public.pokerole_combat_operations;
  v_chat public.chat_messages;
  v_resolution_id text;
  v_expected integer;
  v_received integer;
  v_reactions jsonb;
  v_damage jsonb;
  v_adjusted_targets jsonb;
  v_payload jsonb;
  v_attacker jsonb;
  v_attacker_damage integer;
  v_attacker_id uuid;
begin
  if v_user is null or not public.is_game_member(p_game_id, v_user) then
    raise exception 'You are not a member of this game' using errcode = '42501';
  end if;

  select * into v_source from public.chat_messages
  where id = p_source_message_id and game_id = p_game_id
  for update;
  if not found
     or coalesce(v_source.roll_data ->> 'v', '') <> 'move-1'
     or coalesce(v_source.roll_data ->> 'phase', '') <> 'accuracy' then
    raise exception 'Move accuracy message not found' using errcode = 'P0002';
  end if;
  if v_source.user_id <> v_user and not public.is_game_narrator(p_game_id, v_user) then
    raise exception 'Only the move owner may finalize it' using errcode = '42501';
  end if;

  v_resolution_id := left(coalesce(v_source.roll_data ->> 'resolutionId', ''), 200);
  if v_resolution_id = '' then
    raise exception 'Move resolution is missing' using errcode = '22023';
  end if;
  v_expected := jsonb_array_length(coalesce(v_source.roll_data -> 'reactionTargets', '[]'::jsonb));
  select count(*)::integer, coalesce(jsonb_agg(payload order by created_at), '[]'::jsonb)
    into v_received, v_reactions
  from public.pokerole_combat_operations
  where source_message_id = p_source_message_id and kind = 'reaction';
  if v_received <> v_expected then
    raise exception 'Move still has pending reactions' using errcode = '55000';
  end if;

  insert into public.pokerole_combat_operations (
    game_id, source_message_id, request_id, kind, actor_user_id, payload
  ) values (
    p_game_id, p_source_message_id, v_resolution_id, 'resolution', v_user, '{}'::jsonb
  )
  on conflict (game_id, kind, request_id) do nothing
  returning * into v_operation;

  if v_operation.id is null then
    select * into v_existing from public.pokerole_combat_operations
    where game_id = p_game_id and kind = 'resolution' and request_id = v_resolution_id;
    select * into v_chat from public.chat_messages where id = v_existing.chat_message_id;
    return v_chat;
  end if;

  v_damage := v_source.roll_data -> 'damage';
  if jsonb_typeof(v_damage) = 'object' and jsonb_typeof(v_damage -> 'targets') = 'array' then
    select coalesce(jsonb_agg(
      damage_target || jsonb_build_object(
        'finalDamage',
        case
          when coalesce((damage_target ->> 'immune')::boolean, false) then 0
          when reaction.payload ->> 'choice' = 'evade' and coalesce((reaction.payload ->> 'succeeded')::boolean, false) then 0
          when reaction.payload ->> 'choice' = 'clash' and coalesce((reaction.payload ->> 'succeeded')::boolean, false) then 1
          else greatest(1, coalesce((damage_target ->> 'finalDamage')::integer, 0))
        end
      ) order by damage_target ->> 'requestId'
    ), '[]'::jsonb) into v_adjusted_targets
    from jsonb_array_elements(v_damage -> 'targets') as damage_targets(damage_target)
    left join lateral (
      select payload from public.pokerole_combat_operations operation
      where operation.source_message_id = p_source_message_id
        and operation.kind = 'reaction'
        and operation.request_id = damage_target ->> 'requestId'
      limit 1
    ) reaction on true;
    v_damage := jsonb_set(v_damage, '{targets}', v_adjusted_targets, true);
  end if;

  v_payload := v_source.roll_data || jsonb_build_object(
    'phase', 'resolution',
    'damage', v_damage,
    'reactions', v_reactions
  );

  select count(*)::integer into v_attacker_damage
  from public.pokerole_combat_operations
  where source_message_id = p_source_message_id
    and kind = 'reaction'
    and payload ->> 'choice' = 'clash'
    and coalesce((payload ->> 'succeeded')::boolean, false);

  v_attacker := v_source.roll_data -> 'attacker';
  if v_attacker_damage > 0 and (v_attacker ->> 'characterKind') in ('pokemon', 'trainer') then
    begin
      v_attacker_id := (v_attacker ->> 'characterId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid move attacker' using errcode = '22023';
    end;
    perform public.apply_pokerole_character_damage(
      p_game_id,
      v_attacker ->> 'characterKind',
      v_attacker_id,
      v_attacker_damage
    );
  end if;

  insert into public.chat_messages (game_id, user_id, kind, body, roll_data)
  values (
    p_game_id,
    v_user,
    'move',
    coalesce(v_source.roll_data ->> 'pokemonName', 'Pokémon') || ' used '
      || coalesce(v_source.roll_data #>> '{card,name}', 'Move') || ' · Damage & Effects',
    v_payload
  ) returning * into v_chat;

  update public.pokerole_combat_operations
  set chat_message_id = v_chat.id, payload = v_payload
  where id = v_operation.id;
  return v_chat;
end;
$$;

revoke all on function public.apply_pokerole_character_damage(uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.submit_pokerole_move_reaction(uuid, uuid, jsonb) from public, anon;
revoke all on function public.finalize_pokerole_move(uuid, uuid) from public, anon;
grant execute on function public.submit_pokerole_move_reaction(uuid, uuid, jsonb) to authenticated;
grant execute on function public.finalize_pokerole_move(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
