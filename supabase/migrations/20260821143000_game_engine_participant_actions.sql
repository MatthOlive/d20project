-- Allow a participant owner to register reactions outside that participant's turn.
-- The client still resets the accumulated actions only when that participant's next turn begins.

create or replace function public.commit_game_engine_state(
  p_session_id uuid,
  p_expected_version bigint,
  p_command text,
  p_payload jsonb,
  p_next_state jsonb
)
returns public.game_engine_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session public.game_engine_sessions;
  v_is_narrator boolean;
  v_current_owner text;
  v_target_owner text;
  v_turn_index integer;
  v_next_status text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_session
  from public.game_engine_sessions
  where id = p_session_id
  for update;
  if not found then
    raise exception 'Engine session not found' using errcode = 'P0002';
  end if;

  v_is_narrator := public.is_game_narrator(v_session.game_id, v_user);
  if not v_is_narrator and not public.is_game_member(v_session.game_id, v_user) then
    raise exception 'You are not a member of this game' using errcode = '42501';
  end if;
  if v_session.version <> p_expected_version then
    raise exception 'Engine state changed; reload and try again' using errcode = '40001';
  end if;
  if p_command not in (
    'set_initiative', 'start_turns', 'record_action', 'advance_turn',
    'pause', 'resume', 'finish'
  ) then
    raise exception 'Unsupported engine command' using errcode = '22023';
  end if;
  if jsonb_typeof(p_next_state) <> 'object'
     or coalesce((p_next_state ->> 'schemaVersion')::integer, 0) <> 1
     or jsonb_typeof(p_next_state -> 'participants') <> 'array' then
    raise exception 'Invalid next engine state' using errcode = '22023';
  end if;

  v_turn_index := greatest(coalesce((v_session.state ->> 'turnIndex')::integer, 0), 0);
  v_current_owner := v_session.state #>> array['participants', v_turn_index::text, 'ownerId'];
  select participant ->> 'ownerId'
    into v_target_owner
  from jsonb_array_elements(v_session.state -> 'participants') participant
  where participant ->> 'id' = p_payload ->> 'participantId'
  limit 1;

  if not v_is_narrator then
    if p_command in ('set_initiative', 'record_action')
       and v_target_owner is distinct from v_user::text then
      raise exception 'You do not control this participant' using errcode = '42501';
    elsif p_command = 'advance_turn' and v_current_owner is distinct from v_user::text then
      raise exception 'You do not control the current turn' using errcode = '42501';
    elsif p_command not in ('set_initiative', 'record_action', 'advance_turn') then
      raise exception 'Only the narrator can use this command' using errcode = '42501';
    end if;
  end if;

  v_next_status := p_next_state ->> 'status';
  if v_next_status not in ('setup', 'running', 'paused', 'finished') then
    raise exception 'Invalid engine status' using errcode = '22023';
  end if;

  update public.game_engine_sessions
  set state = p_next_state,
      status = v_next_status,
      version = version + 1,
      updated_at = now()
  where id = p_session_id
  returning * into v_session;

  insert into public.game_engine_events (
    session_id, game_id, version, actor_user_id, command, payload
  ) values (
    v_session.id,
    v_session.game_id,
    v_session.version,
    v_user,
    p_command,
    coalesce(p_payload, '{}'::jsonb)
  );

  return v_session;
end;
$$;

revoke all on function public.commit_game_engine_state(uuid, bigint, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.commit_game_engine_state(uuid, bigint, text, jsonb, jsonb)
  to authenticated;
