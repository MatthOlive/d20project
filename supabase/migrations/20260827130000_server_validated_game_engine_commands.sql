-- Derive engine state transitions on the server instead of trusting a client-supplied next state.
create or replace function public.commit_game_engine_command(
  p_session_id uuid,
  p_expected_version bigint,
  p_command text,
  p_payload jsonb
)
returns public.game_engine_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session public.game_engine_sessions;
  v_is_narrator boolean;
  v_state jsonb;
  v_participants jsonb;
  v_participant jsonb;
  v_metadata jsonb;
  v_current jsonb;
  v_next jsonb;
  v_target_index integer;
  v_current_index integer;
  v_next_index integer;
  v_count integer;
  v_value integer;
  v_actions integer;
  v_successes integer;
  v_wrapped boolean;
  v_has_trainer boolean;
  v_reset_all boolean;
  v_label text;
  v_action_type text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid engine command payload' using errcode = '22023';
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
  if p_expected_version is null or v_session.version <> p_expected_version then
    raise exception 'Engine state changed; reload and try again' using errcode = '40001';
  end if;
  if p_command not in (
    'set_initiative', 'start_turns', 'record_action', 'advance_turn',
    'pause', 'resume', 'finish'
  ) then
    raise exception 'Unsupported engine command' using errcode = '22023';
  end if;

  v_state := v_session.state;
  if jsonb_typeof(v_state) <> 'object'
     or coalesce((v_state ->> 'schemaVersion')::integer, 0) <> 1
     or jsonb_typeof(v_state -> 'participants') <> 'array' then
    raise exception 'Stored engine state is invalid' using errcode = '22023';
  end if;
  v_participants := v_state -> 'participants';
  v_count := jsonb_array_length(v_participants);

  if p_command in ('set_initiative', 'record_action') then
    select (ordinality - 1)::integer, participant
      into v_target_index, v_participant
    from jsonb_array_elements(v_participants) with ordinality as entries(participant, ordinality)
    where participant ->> 'id' = p_payload ->> 'participantId'
    limit 1;
    if v_participant is null then
      raise exception 'Engine participant not found' using errcode = 'P0002';
    end if;
    if not v_is_narrator and (v_participant ->> 'ownerId') is distinct from v_user::text then
      raise exception 'You do not control this participant' using errcode = '42501';
    end if;
  end if;

  if p_command = 'set_initiative' then
    if v_state ->> 'phase' <> 'initiative' then
      raise exception 'Initiative is already closed' using errcode = '55000';
    end if;
    if jsonb_typeof(p_payload -> 'value') <> 'number' then
      raise exception 'Initiative value must be numeric' using errcode = '22023';
    end if;
    v_value := greatest(-9999, least(9999, (p_payload ->> 'value')::integer));
    v_participant := jsonb_set(v_participant, '{initiative}', to_jsonb(v_value), true);
    v_participants := jsonb_set(v_participants, array[v_target_index::text], v_participant, false);
    v_state := jsonb_set(v_state, '{participants}', v_participants, false);

  elsif p_command = 'start_turns' then
    if not v_is_narrator then
      raise exception 'Only the narrator may start turns' using errcode = '42501';
    end if;
    if v_state ->> 'phase' <> 'initiative' or v_count = 0 then
      raise exception 'Participants and initiative are required before turns start' using errcode = '55000';
    end if;
    select coalesce(jsonb_agg(
      jsonb_set(
        jsonb_set(
          participant,
          '{actionsUsed}',
          '0'::jsonb,
          true
        ),
        '{metadata}',
        coalesce(participant -> 'metadata', '{}'::jsonb) || jsonb_build_object(
          'actions', '[]'::jsonb,
          'lastActionType', null,
          'lastActionLabel', null,
          'lastActionSuccesses', null
        ),
        true
      )
      order by
        case when participant ->> 'kind' = 'pokemon' then 0 when participant ->> 'kind' = 'trainer' then 1 else 0 end,
        case when coalesce(participant ->> 'initiative', '') ~ '^-?[0-9]+$'
          then (participant ->> 'initiative')::integer else -9999 end desc,
        lower(coalesce(participant ->> 'name', ''))
    ), '[]'::jsonb) into v_participants
    from jsonb_array_elements(v_participants) as participants(participant);
    v_state := jsonb_set(v_state, '{participants}', v_participants, false)
      || jsonb_build_object(
        'status', 'running',
        'phase', 'turns',
        'round', 1,
        'turnIndex', 0,
        'lastMove', null
      );

  elsif p_command = 'record_action' then
    if v_state ->> 'status' <> 'running' or v_state ->> 'phase' <> 'turns' then
      raise exception 'The encounter is not accepting actions' using errcode = '55000';
    end if;
    v_action_type := left(btrim(coalesce(p_payload ->> 'actionType', '')), 80);
    v_label := nullif(left(btrim(coalesce(p_payload ->> 'label', '')), 200), '');
    if v_action_type = '' then
      raise exception 'Action type is required' using errcode = '22023';
    end if;
    v_actions := greatest(0, coalesce((v_participant ->> 'actionsUsed')::integer, 0)) + 1;
    v_metadata := coalesce(v_participant -> 'metadata', '{}'::jsonb);
    v_metadata := v_metadata || jsonb_build_object(
      'actions', coalesce(v_metadata -> 'actions', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'type', v_action_type,
        'label', v_label,
        'recordedAt', now()
      )),
      'lastActionType', v_action_type,
      'lastActionLabel', v_label
    );
    if jsonb_typeof(p_payload -> 'resultSuccesses') = 'number' then
      v_successes := greatest(0, least(9999, (p_payload ->> 'resultSuccesses')::integer));
      v_metadata := v_metadata || jsonb_build_object('lastActionSuccesses', v_successes);
      if v_action_type = 'move' then
        v_state := jsonb_set(v_state, '{lastMove}', jsonb_build_object(
          'participantId', v_participant ->> 'id',
          'name', coalesce(v_label, 'Move'),
          'successes', v_successes,
          'rolledAt', now()
        ), true);
      end if;
    end if;
    v_participant := jsonb_set(v_participant, '{actionsUsed}', to_jsonb(v_actions), true);
    v_participant := jsonb_set(v_participant, '{metadata}', v_metadata, true);
    v_participants := jsonb_set(v_participants, array[v_target_index::text], v_participant, false);
    v_state := jsonb_set(v_state, '{participants}', v_participants, false);

  elsif p_command = 'advance_turn' then
    if v_state ->> 'status' <> 'running' or v_state ->> 'phase' <> 'turns' or v_count = 0 then
      raise exception 'The encounter is not running' using errcode = '55000';
    end if;
    v_current_index := greatest(0, least(v_count - 1, coalesce((v_state ->> 'turnIndex')::integer, 0)));
    v_current := v_participants -> v_current_index;
    if not v_is_narrator and (v_current ->> 'ownerId') is distinct from v_user::text then
      raise exception 'You do not control the current turn' using errcode = '42501';
    end if;
    v_wrapped := v_current_index >= v_count - 1;
    v_next_index := case when v_wrapped then 0 else v_current_index + 1 end;
    v_next := v_participants -> v_next_index;
    select exists (
      select 1 from jsonb_array_elements(v_participants) as participants(participant)
      where participant ->> 'kind' = 'trainer'
    ) into v_has_trainer;
    v_reset_all := v_state ->> 'systemId' = 'pokerole' and (
      ((v_current ->> 'kind') = 'trainer' and (v_next ->> 'kind') <> 'trainer')
      or (not v_has_trainer and v_wrapped)
    );

    select coalesce(jsonb_agg(
      case
        when v_reset_all
          or (v_state ->> 'systemId' <> 'pokerole' and (ordinality - 1) = v_next_index)
        then jsonb_set(
          jsonb_set(participant, '{actionsUsed}', '0'::jsonb, true),
          '{metadata}',
          coalesce(participant -> 'metadata', '{}'::jsonb) || jsonb_build_object(
            'actions', '[]'::jsonb,
            'lastActionType', null,
            'lastActionLabel', null,
            'lastActionSuccesses', null
          ),
          true
        )
        else participant
      end order by ordinality
    ), '[]'::jsonb) into v_participants
    from jsonb_array_elements(v_participants) with ordinality as entries(participant, ordinality);

    v_state := jsonb_set(v_state, '{participants}', v_participants, false)
      || jsonb_build_object(
        'turnIndex', v_next_index,
        'round', greatest(0, coalesce((v_state ->> 'round')::integer, 0)) + case when v_wrapped then 1 else 0 end
      );
    if v_reset_all then
      v_state := jsonb_set(v_state, '{lastMove}', 'null'::jsonb, true);
    end if;

  elsif p_command = 'pause' then
    if not v_is_narrator then
      raise exception 'Only the narrator may pause the engine' using errcode = '42501';
    end if;
    if v_state ->> 'status' <> 'running' then
      raise exception 'The encounter is not running' using errcode = '55000';
    end if;
    v_state := jsonb_set(v_state, '{status}', '"paused"'::jsonb, false);

  elsif p_command = 'resume' then
    if not v_is_narrator then
      raise exception 'Only the narrator may resume the engine' using errcode = '42501';
    end if;
    if v_state ->> 'status' <> 'paused' then
      raise exception 'The encounter is not paused' using errcode = '55000';
    end if;
    v_state := jsonb_set(v_state, '{status}', '"running"'::jsonb, false);

  elsif p_command = 'finish' then
    if not v_is_narrator then
      raise exception 'Only the narrator may finish the encounter' using errcode = '42501';
    end if;
    v_state := v_state || jsonb_build_object('status', 'finished', 'phase', 'complete');
  end if;

  update public.game_engine_sessions
  set state = v_state,
      status = (v_state ->> 'status')::text,
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

revoke all on function public.commit_game_engine_command(uuid, bigint, text, jsonb)
  from public, anon;
grant execute on function public.commit_game_engine_command(uuid, bigint, text, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
