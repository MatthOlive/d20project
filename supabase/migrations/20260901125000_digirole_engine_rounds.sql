-- DigiRole follows the corrected PokeRole action cycle: Digimon act first,
-- reactions remain counted, and every action resets after the Tamer phase.
do $$
declare
  v_definition text;
  v_old_reset text := $old$v_reset_all := v_state ->> 'systemId' = 'pokerole' and (
      ((v_current ->> 'kind') = 'trainer' and (v_next ->> 'kind') <> 'trainer')
      or (not v_has_trainer and v_wrapped)
    );$old$;
  v_new_reset text := $new$v_reset_all := (
      v_state ->> 'systemId' = 'pokerole' and (
        ((v_current ->> 'kind') = 'trainer' and (v_next ->> 'kind') <> 'trainer')
        or (not v_has_trainer and v_wrapped)
      )
    ) or (
      v_state ->> 'systemId' = 'digirole' and (
        ((v_current ->> 'kind') = 'digirole_tamer' and (v_next ->> 'kind') <> 'digirole_tamer')
        or (not exists (
          select 1
          from jsonb_array_elements(v_participants) participant
          where participant ->> 'kind' = 'digirole_tamer'
        ) and v_wrapped)
      )
    );$new$;
  v_old_next text := $old$or (v_state ->> 'systemId' <> 'pokerole' and (ordinality - 1) = v_next_index)$old$;
  v_new_next text := $new$or (v_state ->> 'systemId' not in ('pokerole', 'digirole') and (ordinality - 1) = v_next_index)$new$;
begin
  select pg_get_functiondef('public.commit_game_engine_command(uuid,bigint,text,jsonb)'::regprocedure)
  into v_definition;
  if position(v_old_reset in v_definition) = 0
     or position(v_old_next in v_definition) = 0 then
    raise exception 'Could not locate the DigiRole round patches in commit_game_engine_command';
  end if;
  v_definition := replace(v_definition, v_old_reset, v_new_reset);
  v_definition := replace(v_definition, v_old_next, v_new_next);
  execute v_definition;
end;
$$;
