-- Let every explicitly assigned controller submit initiative, actions and turn
-- advances. The effective owner remains useful for automatic GM initiative.
do $migration$
declare
  v_definition text;
  v_old_participant text := $old$if not v_is_narrator and (v_participant ->> 'ownerId') is distinct from v_user::text then
      raise exception 'You do not control this participant' using errcode = '42501';
    end if;$old$;
  v_new_participant text := $new$if not v_is_narrator
       and (v_participant ->> 'ownerId') is distinct from v_user::text
       and not exists (
         select 1
         from jsonb_array_elements_text(
           case
             when jsonb_typeof(v_participant #> '{metadata,controllerIds}') = 'array'
               then v_participant #> '{metadata,controllerIds}'
             else '[]'::jsonb
           end
         ) as controllers(controller_id)
         where controller_id = v_user::text
       ) then
      raise exception 'You do not control this participant' using errcode = '42501';
    end if;$new$;
  v_old_current text := $old$if not v_is_narrator and (v_current ->> 'ownerId') is distinct from v_user::text then
      raise exception 'You do not control the current turn' using errcode = '42501';
    end if;$old$;
  v_new_current text := $new$if not v_is_narrator
       and (v_current ->> 'ownerId') is distinct from v_user::text
       and not exists (
         select 1
         from jsonb_array_elements_text(
           case
             when jsonb_typeof(v_current #> '{metadata,controllerIds}') = 'array'
               then v_current #> '{metadata,controllerIds}'
             else '[]'::jsonb
           end
         ) as controllers(controller_id)
         where controller_id = v_user::text
       ) then
      raise exception 'You do not control the current turn' using errcode = '42501';
    end if;$new$;
begin
  select pg_get_functiondef('public.commit_game_engine_command(uuid,bigint,text,jsonb)'::regprocedure)
  into v_definition;

  if position(v_old_participant in v_definition) = 0
     or position(v_old_current in v_definition) = 0 then
    raise exception 'Could not locate the engine controller authorization blocks';
  end if;

  v_definition := replace(v_definition, v_old_participant, v_new_participant);
  v_definition := replace(v_definition, v_old_current, v_new_current);
  execute v_definition;
end;
$migration$;
