-- Allow repeated Data Scans of the same Digimon while it has a token on the map.
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
  if not exists (
    select 1
    from public.tokens t
    where t.game_id = v_game_id
      and t.character_kind = 'digirole_digimon'
      and t.character_id = p_subject_id
  ) then
    raise exception 'The Digimon must have a token on the map to be scanned';
  end if;

  select percentage, scanned_subject_ids
  into v_before, v_scanned
  from public.digirole_scan_data
  where tamer_id = p_tamer_id and species_id = v_species_id;

  v_before := coalesce(v_before, 0);
  v_scanned := coalesce(v_scanned, '{}');
  v_rate := case v_stage
    when 'In-Training I' then 5
    when 'In-Training II' then 5
    when 'Rookie' then 4
    when 'Champion' then 3
    when 'Ultimate' then 2
    else 1
  end;
  v_gain := least(20, greatest(0, p_successes) * v_rate);

  insert into public.digirole_scan_data (
    tamer_id, species_id, percentage, scanned_subject_ids, updated_at
  ) values (
    p_tamer_id, v_species_id, least(200, v_gain), array[p_subject_id], now()
  )
  on conflict (tamer_id, species_id) do update
  set percentage = least(200, public.digirole_scan_data.percentage + excluded.percentage),
      scanned_subject_ids = case
        when p_subject_id = any(public.digirole_scan_data.scanned_subject_ids)
          then public.digirole_scan_data.scanned_subject_ids
        else array_append(public.digirole_scan_data.scanned_subject_ids, p_subject_id)
      end,
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

revoke all on function public.record_digirole_scan(uuid, uuid, integer) from public, anon;
grant execute on function public.record_digirole_scan(uuid, uuid, integer) to authenticated;
