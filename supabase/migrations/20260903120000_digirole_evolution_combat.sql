-- Make an active Digimon form authoritative for combat attributes and signature techniques.
create or replace function public.transform_digirole_form(
  p_digimon_id uuid,
  p_species_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_digimon public.digirole_digimons%rowtype;
  v_current public.digirole_species%rowtype;
  v_target public.digirole_species%rowtype;
  v_form public.digirole_forms%rowtype;
  v_rank_order text[] := array['In-Training I','In-Training II','Rookie','Champion','Ultimate','Mega','Mega+'];
  v_current_index integer;
  v_target_index integer;
  v_step integer;
  v_tamer_cost integer := 0;
  v_digimon_cost integer := 0;
  v_old_max integer;
  v_new_max integer;
  v_old_attrs jsonb;
  v_target_attrs jsonb;
  v_old_vitality integer;
  v_target_vitality integer;
  v_technique_id uuid;
  v_maintenance integer := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_digimon
  from public.digirole_digimons
  where id = p_digimon_id
  for update;
  if v_digimon.id is null then raise exception 'Digimon not found'; end if;
  if not (
    public.can_edit_character(v_digimon.game_id, v_digimon.owner_id)
    or auth.uid() = any(v_digimon.allowed_editors)
  ) then raise exception 'You cannot update this Digimon'; end if;

  select * into v_form
  from public.digirole_forms
  where digimon_id = p_digimon_id and species_id = p_species_id;
  if v_form.digimon_id is null then raise exception 'This form has not been unlocked'; end if;
  if v_digimon.species_id = p_species_id then
    return jsonb_build_object('speciesId',p_species_id,'alreadyActive',true,'cost',0);
  end if;

  select * into v_current from public.digirole_species where id = v_digimon.species_id;
  select * into v_target from public.digirole_species where id = p_species_id;
  if v_target.id is null then raise exception 'Target species not found'; end if;

  v_current_index := array_position(v_rank_order,v_current.stage);
  v_target_index := array_position(v_rank_order,v_target.stage);
  if v_current_index is null or v_target_index is null then
    raise exception 'Use the special evolution control for this form';
  end if;

  if v_target_index > v_current_index then
    for v_step in (v_current_index + 1)..v_target_index loop
      if v_step = 2 and v_current_index = 1 then
        v_tamer_cost := v_tamer_cost + 1;
      else
        v_digimon_cost := v_digimon_cost + case v_step
          when 2 then 1 when 3 then 1 when 4 then 2
          when 5 then 4 when 6 then 6 else 0 end;
      end if;
    end loop;
    v_digimon_cost := v_digimon_cost + greatest(0,v_target_index-v_current_index-1);
  end if;

  if v_tamer_cost > 0 and v_digimon.tamer_id is not null then
    if not exists(
      select 1 from public.digirole_tamers
      where id=v_digimon.tamer_id and ds_current>=v_tamer_cost
    ) then raise exception 'The Tamer does not have enough DigiSoul'; end if;
    update public.digirole_tamers
    set ds_current=ds_current-v_tamer_cost
    where id=v_digimon.tamer_id;
  elsif v_tamer_cost > 0 then
    v_digimon_cost := v_digimon_cost + v_tamer_cost;
    v_tamer_cost := 0;
  end if;
  if v_digimon.ds_current < v_digimon_cost then
    raise exception 'The Digimon does not have enough DigiSoul';
  end if;

  v_old_attrs := coalesce(v_digimon.attrs,'{}'::jsonb);
  v_target_attrs := coalesce(v_target.base_attrs,v_old_attrs);
  v_old_vitality := coalesce((v_old_attrs->>'vitality')::integer,1);
  v_target_vitality := coalesce((v_target_attrs->>'vitality')::integer,1);
  v_old_max := coalesce(v_current.hp_base,3)+v_old_vitality;
  v_new_max := coalesce(v_target.hp_base,3)+v_target_vitality;

  if not v_form.stabilized then
    v_maintenance := case v_target.stage
      when 'In-Training II' then 1 when 'Rookie' then 1 when 'Champion' then 1
      when 'Ultimate' then 2 when 'Mega' then 3 else 0 end;
  end if;

  update public.digirole_digimons
  set species_id=p_species_id,
      rank=v_target.stage,
      attrs=v_target_attrs,
      ds_current=ds_current-v_digimon_cost,
      hp_current=greatest(0,least(v_new_max,hp_current+(v_new_max-v_old_max))),
      evolution_state=evolution_state||jsonb_build_object(
        'activeSpeciesId',p_species_id,
        'activeSpeciesName',v_target.name,
        'maintenanceDs',v_maintenance,
        'transformedAt',now()
      )
  where id=p_digimon_id;

  if v_target.signature_technique is not null then
    select id into v_technique_id
    from public.digirole_techniques
    where lower(name)=lower(v_target.signature_technique)
    order by case when lower(origin)=lower(v_target.name) then 0 else 1 end,
             source_page nulls last
    limit 1;
    if v_technique_id is not null then
      insert into public.digirole_digimon_techniques(digimon_id,technique_id,source)
      values(p_digimon_id,v_technique_id,'signature')
      on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'speciesId',p_species_id,
    'speciesName',v_target.name,
    'tamerDsCost',v_tamer_cost,
    'digimonDsCost',v_digimon_cost,
    'maintenanceDs',v_maintenance,
    'stabilized',v_form.stabilized,
    'attributesApplied',true
  );
end;
$$;

revoke all on function public.transform_digirole_form(uuid, uuid) from public;
grant execute on function public.transform_digirole_form(uuid, uuid) to authenticated;
