-- DigiRole follows PokeRole ordering: Digimon resolve before Tamers.
-- Patch the validated engine command in place so existing Pokerole/T20 behavior is preserved.
do $$
declare
  v_definition text;
  v_old text := 'case when participant ->> ''kind'' = ''pokemon'' then 0 when participant ->> ''kind'' = ''trainer'' then 1 else 0 end,';
  v_new text := 'case when v_session.system_id = ''digirole'' then case when participant ->> ''kind'' = ''digirole_digimon'' then 0 when participant ->> ''kind'' = ''digirole_tamer'' then 1 else 2 end else case when participant ->> ''kind'' = ''pokemon'' then 0 when participant ->> ''kind'' = ''trainer'' then 1 else 0 end end,';
begin
  select pg_get_functiondef('public.commit_game_engine_command(uuid,bigint,text,jsonb)'::regprocedure)
  into v_definition;
  if position(v_old in v_definition) = 0 then
    raise exception 'Could not locate the initiative ordering block in commit_game_engine_command';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$$;
