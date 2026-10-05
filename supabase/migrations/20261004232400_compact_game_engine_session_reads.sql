create or replace function public.get_game_engine_session_compact(p_game_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select to_jsonb(s) || jsonb_build_object(
    'state', jsonb_set(
      s.state,
      '{participants}',
      coalesce((
        select jsonb_agg(
          case
            when participant.value ->> 'imageUrl' like 'data:image/%'
              then jsonb_set(participant.value, '{imageUrl}', 'null'::jsonb, true)
            else participant.value
          end
          order by participant.ordinality
        )
        from jsonb_array_elements(s.state -> 'participants')
          with ordinality as participant(value, ordinality)
      ), '[]'::jsonb),
      true
    )
  )
  from public.game_engine_sessions s
  where s.game_id = p_game_id
  limit 1;
$$;

revoke all on function public.get_game_engine_session_compact(uuid) from public, anon;
grant execute on function public.get_game_engine_session_compact(uuid) to authenticated;
