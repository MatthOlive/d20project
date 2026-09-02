-- Unlocked forms remain in the DigiArchive and track stabilization independently.
create table if not exists public.digirole_forms (
  digimon_id uuid not null references public.digirole_digimons(id) on delete cascade,
  species_id uuid not null references public.digirole_species(id) on delete cascade,
  stabilized boolean not null default false,
  victories integer not null default 0 check (victories >= 0),
  requirements_confirmed boolean not null default false,
  unlocked_at timestamptz not null default now(),
  stabilized_at timestamptz,
  notes text,
  primary key (digimon_id, species_id)
);

alter table public.digirole_forms enable row level security;

drop policy if exists "members view digirole forms" on public.digirole_forms;
create policy "members view digirole forms" on public.digirole_forms
for select to authenticated using (exists (
  select 1 from public.digirole_digimons d
  where d.id = digimon_id and public.is_game_member(d.game_id, auth.uid())
));
drop policy if exists "controllers manage digirole forms" on public.digirole_forms;
create policy "controllers manage digirole forms" on public.digirole_forms
for all to authenticated using (exists (
  select 1 from public.digirole_digimons d where d.id = digimon_id
  and (public.can_edit_character(d.game_id, d.owner_id) or auth.uid() = any(d.allowed_editors))
)) with check (exists (
  select 1 from public.digirole_digimons d where d.id = digimon_id
  and (public.can_edit_character(d.game_id, d.owner_id) or auth.uid() = any(d.allowed_editors))
));

create or replace function public.register_digirole_initial_form()
returns trigger language plpgsql security definer set search_path = public set row_security = off as $$
begin
  if new.species_id is not null then
    insert into public.digirole_forms (
      digimon_id, species_id, stabilized, requirements_confirmed, stabilized_at
    ) values (new.id, new.species_id, true, true, now())
    on conflict (digimon_id, species_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists digirole_digimons_register_initial_form on public.digirole_digimons;
create trigger digirole_digimons_register_initial_form
after insert on public.digirole_digimons
for each row execute function public.register_digirole_initial_form();

insert into public.digirole_forms (
  digimon_id, species_id, stabilized, requirements_confirmed, stabilized_at
)
select id, species_id, true, true, created_at
from public.digirole_digimons
where species_id is not null
on conflict (digimon_id, species_id) do nothing;

create or replace function public.unlock_digirole_form(
  p_digimon_id uuid,
  p_species_id uuid,
  p_requirements_confirmed boolean,
  p_force boolean default false
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
  v_rank_order text[] := array['In-Training I','In-Training II','Rookie','Champion','Ultimate','Mega','Mega+'];
  v_target_index integer;
  v_rank_index integer;
  v_cost integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_digimon from public.digirole_digimons where id = p_digimon_id for update;
  if v_digimon.id is null then raise exception 'Digimon not found'; end if;
  if not (public.can_edit_character(v_digimon.game_id, v_digimon.owner_id) or auth.uid() = any(v_digimon.allowed_editors)) then
    raise exception 'You cannot update this Digimon';
  end if;
  if p_force and not public.is_game_narrator(v_digimon.game_id, auth.uid()) then
    raise exception 'Only the narrator can force an evolution route';
  end if;
  if exists (select 1 from public.digirole_forms where digimon_id = p_digimon_id and species_id = p_species_id) then
    return jsonb_build_object('alreadyUnlocked', true, 'speciesId', p_species_id, 'cost', 0);
  end if;

  select * into v_current from public.digirole_species where id = v_digimon.species_id;
  select * into v_target from public.digirole_species where id = p_species_id;
  if v_target.id is null then raise exception 'Target form not found'; end if;
  v_target_index := array_position(v_rank_order, v_target.stage);
  v_rank_index := array_position(v_rank_order, v_digimon.rank);
  if not p_force and (v_target_index is null or v_rank_index is null or v_target_index > v_rank_index) then
    raise exception 'The Digimon Rank is not high enough for this form';
  end if;
  if not p_force and not p_requirements_confirmed then
    raise exception 'Confirm the form requirements before unlocking it';
  end if;
  if not p_force and (
    v_current.evolution_text is null
    or position(upper(v_target.name) in upper(v_current.evolution_text)) = 0
  ) then
    raise exception 'This form is not listed in the current evolution routes';
  end if;

  v_cost := case v_target.stage
    when 'In-Training II' then 2
    when 'Rookie' then 5
    when 'Champion' then 15
    when 'Ultimate' then 25
    when 'Mega' then 40
    else 0
  end;
  if not p_force and v_digimon.pe < v_cost then raise exception 'Not enough Evolution Points'; end if;

  insert into public.digirole_forms (
    digimon_id, species_id, stabilized, victories, requirements_confirmed
  ) values (p_digimon_id, p_species_id, false, 0, p_requirements_confirmed or p_force);
  if not p_force then
    update public.digirole_digimons set pe = pe - v_cost where id = p_digimon_id;
  end if;

  return jsonb_build_object('speciesId', p_species_id, 'cost', case when p_force then 0 else v_cost end, 'forced', p_force);
end;
$$;

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
  v_vitality integer;
  v_technique_id uuid;
  v_maintenance integer := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_digimon from public.digirole_digimons where id = p_digimon_id for update;
  if v_digimon.id is null then raise exception 'Digimon not found'; end if;
  if not (public.can_edit_character(v_digimon.game_id, v_digimon.owner_id) or auth.uid() = any(v_digimon.allowed_editors)) then
    raise exception 'You cannot update this Digimon';
  end if;
  select * into v_form from public.digirole_forms
  where digimon_id = p_digimon_id and species_id = p_species_id;
  if v_form.digimon_id is null then raise exception 'This form has not been unlocked'; end if;
  if v_digimon.species_id = p_species_id then
    return jsonb_build_object('speciesId', p_species_id, 'alreadyActive', true, 'cost', 0);
  end if;

  select * into v_current from public.digirole_species where id = v_digimon.species_id;
  select * into v_target from public.digirole_species where id = p_species_id;
  v_current_index := array_position(v_rank_order, v_current.stage);
  v_target_index := array_position(v_rank_order, v_target.stage);

  if v_target_index > v_current_index then
    for v_step in (v_current_index + 1)..v_target_index loop
      if v_step = 2 and v_current_index = 1 then
        v_tamer_cost := v_tamer_cost + 1;
      else
        v_digimon_cost := v_digimon_cost + case v_step
          when 2 then 1 when 3 then 1 when 4 then 2 when 5 then 4 when 6 then 6 else 0
        end;
      end if;
    end loop;
    v_digimon_cost := v_digimon_cost + greatest(0, v_target_index - v_current_index - 1);
  end if;

  if v_tamer_cost > 0 then
    if v_digimon.tamer_id is null then raise exception 'This transformation requires a linked Tamer'; end if;
    if not exists (select 1 from public.digirole_tamers where id = v_digimon.tamer_id and ds_current >= v_tamer_cost) then
      raise exception 'The Tamer does not have enough DigiSoul';
    end if;
    update public.digirole_tamers set ds_current = ds_current - v_tamer_cost where id = v_digimon.tamer_id;
  end if;
  if v_digimon.ds_current < v_digimon_cost then raise exception 'The Digimon does not have enough DigiSoul'; end if;

  v_vitality := coalesce((v_digimon.attrs ->> 'vitality')::integer, 1);
  v_old_max := coalesce(v_current.hp_base, 3) + v_vitality;
  v_new_max := v_target.hp_base + v_vitality;
  if not v_form.stabilized then
    v_maintenance := case v_target.stage
      when 'In-Training II' then 1
      when 'Rookie' then 1
      when 'Champion' then 1
      when 'Ultimate' then 2
      when 'Mega' then 3
      else 0
    end;
  end if;

  update public.digirole_digimons
  set species_id = p_species_id,
      ds_current = ds_current - v_digimon_cost,
      hp_current = greatest(0, least(v_new_max, hp_current + (v_new_max - v_old_max))),
      evolution_state = evolution_state || jsonb_build_object(
        'activeSpeciesId', p_species_id,
        'activeSpeciesName', v_target.name,
        'maintenanceDs', v_maintenance,
        'transformedAt', now()
      )
  where id = p_digimon_id;

  if v_target.signature_technique is not null then
    select id into v_technique_id from public.digirole_techniques
    where lower(name) = lower(v_target.signature_technique)
    order by case when lower(origin) = lower(v_target.name) then 0 else 1 end, source_page nulls last
    limit 1;
    if v_technique_id is not null then
      insert into public.digirole_digimon_techniques (digimon_id, technique_id, source)
      values (p_digimon_id, v_technique_id, 'signature') on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'speciesId', p_species_id,
    'speciesName', v_target.name,
    'tamerDsCost', v_tamer_cost,
    'digimonDsCost', v_digimon_cost,
    'maintenanceDs', v_maintenance,
    'stabilized', v_form.stabilized
  );
end;
$$;

create or replace function public.record_digirole_form_victory(
  p_digimon_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_digimon public.digirole_digimons%rowtype;
  v_form public.digirole_forms%rowtype;
  v_required integer;
  v_new_victories integer;
  v_newly_stabilized boolean := false;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_digimon from public.digirole_digimons where id = p_digimon_id for update;
  if v_digimon.id is null then raise exception 'Digimon not found'; end if;
  if not (public.can_edit_character(v_digimon.game_id, v_digimon.owner_id) or auth.uid() = any(v_digimon.allowed_editors)) then
    raise exception 'You cannot update this Digimon';
  end if;
  select f.* into v_form
  from public.digirole_forms f
  where f.digimon_id = p_digimon_id and f.species_id = v_digimon.species_id
  for update;
  if v_form.digimon_id is null then raise exception 'Active form is not registered'; end if;

  select s.stabilization_victories into v_required
  from public.digirole_species s
  where s.id = v_form.species_id;

  v_new_victories := v_form.victories + 1;
  v_newly_stabilized := not v_form.stabilized and v_new_victories >= v_required;
  update public.digirole_forms
  set victories = v_new_victories,
      stabilized = stabilized or v_newly_stabilized,
      stabilized_at = case when v_newly_stabilized then now() else stabilized_at end
  where digimon_id = p_digimon_id and species_id = v_digimon.species_id;
  update public.digirole_digimons
  set victories = victories + 1,
      stabilized_forms = stabilized_forms + case when v_newly_stabilized then 1 else 0 end,
      evolution_state = case when v_newly_stabilized then evolution_state || '{"maintenanceDs":0}'::jsonb else evolution_state end
  where id = p_digimon_id;

  return jsonb_build_object(
    'victories', v_new_victories,
    'required', v_required,
    'stabilized', v_form.stabilized or v_newly_stabilized,
    'newlyStabilized', v_newly_stabilized
  );
end;
$$;

revoke all on function public.unlock_digirole_form(uuid, uuid, boolean, boolean) from public;
revoke all on function public.transform_digirole_form(uuid, uuid) from public;
revoke all on function public.record_digirole_form_victory(uuid) from public;
grant execute on function public.unlock_digirole_form(uuid, uuid, boolean, boolean) to authenticated;
grant execute on function public.transform_digirole_form(uuid, uuid) to authenticated;
grant execute on function public.record_digirole_form_victory(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.digirole_forms;
exception when duplicate_object then null;
end $$;
