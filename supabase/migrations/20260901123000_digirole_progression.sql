-- Atomic DigiRole progression: Data Scan, condensation and daily training.
alter table public.digirole_scan_data
  add column if not exists scanned_subject_ids uuid[] not null default '{}';

alter table public.digirole_digimons
  add column if not exists last_training_on date,
  add column if not exists retraining_successes integer not null default 0 check (retraining_successes >= 0),
  add column if not exists unspent_attr_points integer not null default 0 check (unspent_attr_points >= 0),
  add column if not exists unspent_skill_points integer not null default 0 check (unspent_skill_points >= 0),
  add column if not exists condensation_bonus integer not null default 0 check (condensation_bonus between 0 and 2);

create or replace function public.record_digirole_scan(
  p_tamer_id uuid,
  p_subject_id uuid,
  p_successes integer
) returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_game_id uuid;
  v_owner_id uuid;
  v_editors uuid[];
  v_species_id uuid;
  v_stage text;
  v_rate integer;
  v_before integer := 0;
  v_total integer;
  v_gain integer;
  v_scanned uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_successes < 0 then raise exception 'Successes cannot be negative'; end if;

  select game_id, owner_id, allowed_editors
  into v_game_id, v_owner_id, v_editors
  from public.digirole_tamers
  where id = p_tamer_id;
  if v_game_id is null then raise exception 'Tamer not found'; end if;
  if not (public.can_edit_character(v_game_id, v_owner_id) or auth.uid() = any(v_editors)) then
    raise exception 'You cannot update this Tamer';
  end if;

  select d.species_id, s.stage
  into v_species_id, v_stage
  from public.digirole_digimons d
  join public.digirole_species s on s.id = d.species_id
  where d.id = p_subject_id and d.game_id = v_game_id;
  if v_species_id is null then raise exception 'Scan target not found in this game'; end if;

  select percentage, scanned_subject_ids
  into v_before, v_scanned
  from public.digirole_scan_data
  where tamer_id = p_tamer_id and species_id = v_species_id;
  v_before := coalesce(v_before, 0);
  v_scanned := coalesce(v_scanned, '{}');
  if p_subject_id = any(v_scanned) then
    raise exception 'This individual has already been scanned by this Tamer';
  end if;

  v_rate := case v_stage
    when 'In-Training I' then 5
    when 'In-Training II' then 5
    when 'Rookie' then 4
    when 'Champion' then 3
    when 'Ultimate' then 2
    else 1
  end;
  v_gain := least(20, greatest(0, p_successes) * v_rate);

  insert into public.digirole_scan_data (tamer_id, species_id, percentage, scanned_subject_ids, updated_at)
  values (p_tamer_id, v_species_id, least(200, v_gain), array[p_subject_id], now())
  on conflict (tamer_id, species_id) do update
  set percentage = least(200, public.digirole_scan_data.percentage + excluded.percentage),
      scanned_subject_ids = array_append(public.digirole_scan_data.scanned_subject_ids, p_subject_id),
      updated_at = now()
  returning percentage into v_total;

  return jsonb_build_object(
    'speciesId', v_species_id,
    'stage', v_stage,
    'successes', p_successes,
    'gained', v_total - v_before,
    'total', v_total
  );
end;
$$;

create or replace function public.condense_digirole(
  p_tamer_id uuid,
  p_species_id uuid,
  p_nickname text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_tamer public.digirole_tamers%rowtype;
  v_species public.digirole_species%rowtype;
  v_scan integer;
  v_bonus integer;
  v_digimon_id uuid;
  v_technique_id uuid;
  v_vitality integer;
  v_spirit integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_tamer from public.digirole_tamers where id = p_tamer_id;
  if v_tamer.id is null then raise exception 'Tamer not found'; end if;
  if not (public.can_edit_character(v_tamer.game_id, v_tamer.owner_id) or auth.uid() = any(v_tamer.allowed_editors)) then
    raise exception 'You cannot update this Tamer';
  end if;

  select * into v_species from public.digirole_species where id = p_species_id;
  if v_species.id is null then raise exception 'Species not found'; end if;
  select percentage into v_scan from public.digirole_scan_data
  where tamer_id = p_tamer_id and species_id = p_species_id
  for update;
  if coalesce(v_scan, 0) < 100 then raise exception 'At least 100 percent Scan Data is required'; end if;

  v_bonus := case when v_scan >= 200 then 2 when v_scan >= 150 then 1 else 0 end;
  v_vitality := coalesce((v_species.base_attrs ->> 'vitality')::integer, 1);
  v_spirit := coalesce((v_species.base_attrs ->> 'spirit')::integer, 1);

  insert into public.digirole_digimons (
    game_id, owner_id, tamer_id, species_id, nickname, rank, attrs, skills,
    hp_current, ds_current, condensation_bonus, evolution_state,
    allowed_viewers, allowed_editors
  ) values (
    v_tamer.game_id, v_tamer.owner_id, v_tamer.id, v_species.id,
    nullif(trim(p_nickname), ''), v_species.stage, v_species.base_attrs, '{}'::jsonb,
    v_species.hp_base + v_vitality, 2 + v_spirit + 1, v_bonus,
    jsonb_build_object('condensed', true, 'condensationBonus', v_bonus, 'condensedAt', now()),
    v_tamer.allowed_viewers, v_tamer.allowed_editors
  ) returning id into v_digimon_id;

  update public.digirole_digimons
  set unspent_attr_points = v_bonus
  where id = v_digimon_id;

  if v_species.signature_technique is not null then
    select id into v_technique_id
    from public.digirole_techniques
    where lower(name) = lower(v_species.signature_technique)
    order by case when lower(origin) = lower(v_species.name) then 0 else 1 end, source_page nulls last
    limit 1;
    if v_technique_id is not null then
      insert into public.digirole_digimon_techniques (digimon_id, technique_id, source)
      values (v_digimon_id, v_technique_id, 'signature')
      on conflict do nothing;
    end if;
  end if;

  update public.digirole_scan_data
  set percentage = 0, updated_at = now()
  where tamer_id = p_tamer_id and species_id = p_species_id;
  update public.digirole_tamers
  set condensed_count = condensed_count + 1
  where id = p_tamer_id;

  return jsonb_build_object(
    'digimonId', v_digimon_id,
    'speciesId', p_species_id,
    'spent', v_scan,
    'bonus', v_bonus
  );
end;
$$;

create or replace function public.record_digirole_training(
  p_digimon_id uuid,
  p_successes integer,
  p_force boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_digimon public.digirole_digimons%rowtype;
  v_tamer_rank text;
  v_rank_order text[] := array['In-Training I','In-Training II','Rookie','Champion','Ultimate','Mega'];
  v_rank_index integer;
  v_tamer_index integer;
  v_next_rank text;
  v_required integer;
  v_total integer;
  v_ranked_up boolean := false;
  v_attr_points integer := 0;
  v_skill_points integer := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_successes < 0 then raise exception 'Successes cannot be negative'; end if;

  select * into v_digimon from public.digirole_digimons where id = p_digimon_id for update;
  if v_digimon.id is null then raise exception 'Digimon not found'; end if;
  if not (public.can_edit_character(v_digimon.game_id, v_digimon.owner_id) or auth.uid() = any(v_digimon.allowed_editors)) then
    raise exception 'You cannot update this Digimon';
  end if;
  if p_force and not public.is_game_narrator(v_digimon.game_id, auth.uid()) then
    raise exception 'Only the narrator can ignore the daily training limit';
  end if;
  if not p_force and v_digimon.last_training_on = current_date then
    raise exception 'This Digimon has already completed a Training Roll today';
  end if;

  v_rank_index := array_position(v_rank_order, v_digimon.rank);
  if v_rank_index is null or v_rank_index >= array_length(v_rank_order, 1) then
    raise exception 'This Digimon cannot advance to another normal Rank';
  end if;
  v_next_rank := v_rank_order[v_rank_index + 1];
  if v_digimon.tamer_id is not null then
    select rank into v_tamer_rank from public.digirole_tamers where id = v_digimon.tamer_id;
    v_tamer_index := array_position(v_rank_order, v_tamer_rank);
    if v_tamer_index is not null and v_rank_index >= v_tamer_index then
      raise exception 'A Digimon cannot be trained above its Tamer Rank';
    end if;
  end if;

  v_required := case v_next_rank
    when 'In-Training II' then 3
    when 'Rookie' then 6
    when 'Champion' then 12
    when 'Ultimate' then 24
    when 'Mega' then 36
  end;
  v_total := v_digimon.training_successes + p_successes;
  if v_total >= v_required then
    v_ranked_up := true;
    v_total := 0;
    v_attr_points := 2;
    v_skill_points := case v_next_rank
      when 'In-Training II' then 4
      when 'Rookie' then 3
      when 'Champion' then 2
      else 1
    end;
  end if;

  update public.digirole_digimons
  set training_successes = v_total,
      last_training_on = current_date,
      rank = case when v_ranked_up then v_next_rank else rank end,
      unspent_attr_points = unspent_attr_points + v_attr_points,
      unspent_skill_points = unspent_skill_points + v_skill_points
  where id = p_digimon_id;

  return jsonb_build_object(
    'successes', p_successes,
    'trainingTotal', v_total,
    'required', v_required,
    'rankedUp', v_ranked_up,
    'rank', case when v_ranked_up then v_next_rank else v_digimon.rank end,
    'attrPoints', v_attr_points,
    'skillPoints', v_skill_points
  );
end;
$$;

revoke all on function public.record_digirole_scan(uuid, uuid, integer) from public;
revoke all on function public.condense_digirole(uuid, uuid, text) from public;
revoke all on function public.record_digirole_training(uuid, integer, boolean) from public;
grant execute on function public.record_digirole_scan(uuid, uuid, integer) to authenticated;
grant execute on function public.condense_digirole(uuid, uuid, text) to authenticated;
grant execute on function public.record_digirole_training(uuid, integer, boolean) to authenticated;

create or replace function public.use_digirole_technique(
  p_digimon_id uuid,
  p_ds_cost integer,
  p_body text,
  p_roll_data jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_digimon public.digirole_digimons%rowtype;
  v_message_id uuid;
  v_ds integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_ds_cost < 0 then raise exception 'DigiSoul cost cannot be negative'; end if;
  select * into v_digimon from public.digirole_digimons where id = p_digimon_id for update;
  if v_digimon.id is null then raise exception 'Digimon not found'; end if;
  if not (public.can_edit_character(v_digimon.game_id, v_digimon.owner_id) or auth.uid() = any(v_digimon.allowed_editors)) then
    raise exception 'You cannot use a technique with this Digimon';
  end if;
  if v_digimon.ds_current < p_ds_cost then raise exception 'Not enough DigiSoul'; end if;

  update public.digirole_digimons
  set ds_current = ds_current - p_ds_cost
  where id = p_digimon_id
  returning ds_current into v_ds;
  insert into public.chat_messages (game_id, user_id, kind, body, roll_data)
  values (v_digimon.game_id, auth.uid(), 'move', p_body, p_roll_data)
  returning id into v_message_id;

  return jsonb_build_object('messageId', v_message_id, 'dsCurrent', v_ds);
end;
$$;

revoke all on function public.use_digirole_technique(uuid, integer, text, jsonb) from public;
grant execute on function public.use_digirole_technique(uuid, integer, text, jsonb) to authenticated;
