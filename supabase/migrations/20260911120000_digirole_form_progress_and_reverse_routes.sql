-- Keep progression counters with each unlocked form and allow discovering prior branches.
alter table public.digirole_forms
  add column if not exists pe integer not null default 0 check (pe >= 0),
  add column if not exists battles integer not null default 0 check (battles >= 0);

update public.digirole_forms f
set pe = d.pe,
    battles = d.battles,
    victories = d.victories
from public.digirole_digimons d
where d.id = f.digimon_id and d.species_id = f.species_id;

create or replace function public.register_digirole_initial_form()
returns trigger language plpgsql security definer set search_path = public set row_security = off as $$
begin
  if new.species_id is not null then
    insert into public.digirole_forms (
      digimon_id, species_id, stabilized, pe, battles, victories,
      requirements_confirmed, stabilized_at
    ) values (
      new.id, new.species_id, true, new.pe, new.battles, new.victories,
      true, now()
    ) on conflict (digimon_id, species_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.unlock_digirole_form(
  p_digimon_id uuid,
  p_species_id uuid,
  p_requirements_confirmed boolean,
  p_force boolean default false
) returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare
  v_digimon public.digirole_digimons%rowtype;
  v_current public.digirole_species%rowtype;
  v_target public.digirole_species%rowtype;
  v_cost integer;
  v_forward boolean;
  v_reverse boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_digimon from public.digirole_digimons where id=p_digimon_id for update;
  if v_digimon.id is null then raise exception 'Digimon not found'; end if;
  if not (v_digimon.owner_id=auth.uid() or public.is_game_narrator(v_digimon.game_id,auth.uid())) then
    raise exception 'You cannot update this Digimon';
  end if;
  if p_force and not public.is_game_narrator(v_digimon.game_id,auth.uid()) then
    raise exception 'Only the narrator can force an evolution route';
  end if;
  if exists(select 1 from public.digirole_forms where digimon_id=p_digimon_id and species_id=p_species_id) then
    return jsonb_build_object('alreadyUnlocked',true,'speciesId',p_species_id,'cost',0);
  end if;

  select * into v_current from public.digirole_species where id=v_digimon.species_id;
  select * into v_target from public.digirole_species where id=p_species_id;
  if v_target.id is null then raise exception 'Target form not found'; end if;
  if not p_force and not p_requirements_confirmed then
    raise exception 'Confirm the form requirements before unlocking it';
  end if;

  v_forward := coalesce(position(upper(v_target.name) in upper(v_current.evolution_text)),0)>0;
  v_reverse := public.digirole_evolution_rank_order(v_target.stage)
      < public.digirole_evolution_rank_order(v_current.stage)
    and coalesce(position(upper(v_current.name) in upper(v_target.evolution_text)),0)>0;
  if not p_force and not (v_forward or v_reverse) then
    raise exception 'This form is not connected to the current evolution routes';
  end if;

  v_cost := case v_target.stage
    when 'In-Training II' then 2 when 'Rookie' then 5 when 'Champion' then 15
    when 'Ultimate' then 25 when 'Mega' then 40 when 'Mega+' then 40
    when 'Armor' then 15 when 'Hybrid' then 15 when 'Jogress' then 25 else 0 end;
  if not p_force and v_digimon.pe<v_cost then raise exception 'Not enough Evolution Points'; end if;

  insert into public.digirole_forms(
    digimon_id,species_id,stabilized,pe,battles,victories,requirements_confirmed
  ) values (p_digimon_id,p_species_id,false,0,0,0,p_requirements_confirmed or p_force);
  if not p_force then
    update public.digirole_digimons set pe=pe-v_cost where id=p_digimon_id;
    update public.digirole_forms set pe=greatest(v_digimon.pe-v_cost,0)
    where digimon_id=p_digimon_id and species_id=v_digimon.species_id;
  end if;
  return jsonb_build_object(
    'speciesId',p_species_id,'cost',case when p_force then 0 else v_cost end,
    'forced',p_force,'direction',case when v_reverse then 'previous' else 'next' end
  );
end;
$$;

create or replace function public.transform_digirole_form(
  p_digimon_id uuid,
  p_species_id uuid
) returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
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
  select * into v_digimon from public.digirole_digimons where id=p_digimon_id for update;
  if v_digimon.id is null then raise exception 'Digimon not found'; end if;
  if not (v_digimon.owner_id=auth.uid() or public.is_game_narrator(v_digimon.game_id,auth.uid())) then
    raise exception 'You cannot update this Digimon';
  end if;
  select * into v_form from public.digirole_forms
  where digimon_id=p_digimon_id and species_id=p_species_id for update;
  if v_form.digimon_id is null then raise exception 'This form has not been unlocked'; end if;
  if v_digimon.species_id=p_species_id then
    return jsonb_build_object('speciesId',p_species_id,'alreadyActive',true,'cost',0);
  end if;

  select * into v_current from public.digirole_species where id=v_digimon.species_id;
  select * into v_target from public.digirole_species where id=p_species_id;
  if v_target.id is null then raise exception 'Target species not found'; end if;
  v_current_index := array_position(v_rank_order,v_current.stage);
  v_target_index := array_position(v_rank_order,v_target.stage);
  if v_current_index is null or v_target_index is null then
    raise exception 'Use the special evolution control for this form';
  end if;

  if v_target_index>v_current_index then
    for v_step in (v_current_index+1)..v_target_index loop
      v_tamer_cost := v_tamer_cost + case v_step
        when 2 then 1 when 3 then 1 when 4 then 2 when 5 then 4 when 6 then 6 else 0 end;
    end loop;
    v_tamer_cost := v_tamer_cost + greatest(0,v_target_index-v_current_index-1);
  end if;
  if v_tamer_cost>0 then
    if v_digimon.tamer_id is null then
      raise exception 'Link this Digimon to a Tamer before Digievolving';
    end if;
    update public.digirole_tamers set ds_current=ds_current-v_tamer_cost
    where id=v_digimon.tamer_id and ds_current>=v_tamer_cost;
    if not found then raise exception 'The Tamer does not have enough DigiSoul'; end if;
  end if;

  update public.digirole_forms
  set pe=v_digimon.pe,battles=v_digimon.battles,victories=v_digimon.victories
  where digimon_id=p_digimon_id and species_id=v_digimon.species_id;

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
      attrs=v_target_attrs,
      image_url=coalesce(v_target.image_url,v_digimon.image_url),
      image_hidden=false,
      pe=v_form.pe,
      battles=v_form.battles,
      victories=v_form.victories,
      hp_current=greatest(0,least(v_new_max,hp_current+(v_new_max-v_old_max))),
      evolution_state=evolution_state||jsonb_build_object(
        'activeSpeciesId',p_species_id,'activeSpeciesName',v_target.name,
        'maintenanceDs',v_maintenance,'transformedAt',now()
      )
  where id=p_digimon_id;

  delete from public.digirole_digimon_techniques
  where digimon_id=p_digimon_id and source='signature';
  if v_target.signature_technique is not null then
    select id into v_technique_id from public.digirole_techniques
    where lower(name)=lower(v_target.signature_technique)
    order by case when lower(origin)=lower(v_target.name) then 0 else 1 end,
             source_page nulls last limit 1;
    if v_technique_id is not null then
      insert into public.digirole_digimon_techniques(digimon_id,technique_id,source)
      values(p_digimon_id,v_technique_id,'signature') on conflict do nothing;
    end if;
  end if;
  return jsonb_build_object(
    'speciesId',p_species_id,'speciesName',v_target.name,'tamerDsCost',v_tamer_cost,
    'digimonDsCost',0,'maintenanceDs',v_maintenance,'stabilized',v_form.stabilized,
    'attributesApplied',true,'imageApplied',true,'pe',v_form.pe,
    'battles',v_form.battles,'victories',v_form.victories
  );
end;
$$;

revoke all on function public.unlock_digirole_form(uuid,uuid,boolean,boolean) from public;
revoke all on function public.transform_digirole_form(uuid,uuid) from public;
grant execute on function public.unlock_digirole_form(uuid,uuid,boolean,boolean) to authenticated;
grant execute on function public.transform_digirole_form(uuid,uuid) to authenticated;
