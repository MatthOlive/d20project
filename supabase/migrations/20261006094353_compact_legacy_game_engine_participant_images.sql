-- Remove only legacy inline image payloads from saved engine participants.
-- The compact session RPC and current client already omit these data URLs,
-- so keeping them in the stored state only inflates database and Realtime payloads.
update public.game_engine_sessions s
set state = jsonb_set(
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
where jsonb_typeof(s.state -> 'participants') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(s.state -> 'participants') = 'array'
          then s.state -> 'participants'
        else '[]'::jsonb
      end
    ) as participant(value)
    where participant.value ->> 'imageUrl' like 'data:image/%'
  );
