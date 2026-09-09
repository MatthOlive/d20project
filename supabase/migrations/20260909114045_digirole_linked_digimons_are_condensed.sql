-- A Digimon becomes condensed as soon as it is linked to a Tamer roster.
-- This version matches the migration identifier assigned by the remote project.

create or replace function public.assign_digimon_to_tamer(
  p_digimon_id uuid,
  p_tamer_id uuid,
  p_team_slot integer default 0
) returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_digimon public.digirole_digimons%rowtype;
  v_tamer public.digirole_tamers%rowtype;
  v_previous_tamer_id uuid;
  v_was_condensed boolean;
  v_slot integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_digimon
  from public.digirole_digimons
  where id = p_digimon_id
  for update;

  select * into v_tamer
  from public.digirole_tamers
  where id = p_tamer_id
  for update;

  if v_digimon.id is null or v_tamer.id is null or v_digimon.game_id <> v_tamer.game_id then
    raise exception 'Digimon and Tamer must belong to the same game';
  end if;
  if not (
    public.can_edit_character(v_tamer.game_id, v_tamer.owner_id)
    or auth.uid() = any(v_tamer.allowed_editors)
  ) then
    raise exception 'You cannot organize this Tamer roster';
  end if;
  if not public.can_view_character(v_digimon.game_id, 'digirole_digimon', v_digimon.id) then
    raise exception 'You cannot use this Digimon';
  end if;

  v_previous_tamer_id := v_digimon.tamer_id;
  v_was_condensed := lower(coalesce(v_digimon.evolution_state ->> 'condensed', 'false')) = 'true';

  if p_team_slot is null then
    v_slot := null;
  elsif p_team_slot between 1 and 4 then
    v_slot := p_team_slot;
  else
    select slot into v_slot
    from generate_series(1, 4) slot
    where not exists (
      select 1
      from public.digirole_digimons d
      where d.tamer_id = p_tamer_id
        and d.team_slot = slot
        and d.id <> p_digimon_id
    )
    order by slot
    limit 1;
  end if;

  if v_slot is not null then
    update public.digirole_digimons
    set team_slot = null
    where tamer_id = p_tamer_id
      and team_slot = v_slot
      and id <> p_digimon_id;
  end if;

  update public.digirole_digimons
  set tamer_id = p_tamer_id,
      team_slot = v_slot,
      owner_id = v_tamer.owner_id,
      allowed_viewers = v_tamer.allowed_viewers,
      allowed_editors = v_tamer.allowed_editors,
      evolution_state = jsonb_set(
        jsonb_set(
          coalesce(evolution_state, '{}'::jsonb),
          '{condensed}',
          'true'::jsonb,
          true
        ),
        '{condensedAt}',
        coalesce(evolution_state -> 'condensedAt', to_jsonb(now())),
        true
      )
  where id = p_digimon_id;

  if v_previous_tamer_id is distinct from p_tamer_id then
    if v_previous_tamer_id is not null then
      update public.digirole_tamers
      set condensed_count = greatest(0, condensed_count - 1)
      where id = v_previous_tamer_id;
    end if;
    update public.digirole_tamers
    set condensed_count = condensed_count + 1
    where id = p_tamer_id;
  elsif not v_was_condensed then
    update public.digirole_tamers
    set condensed_count = condensed_count + 1
    where id = p_tamer_id;
  end if;

  return v_slot;
end;
$$;

revoke all on function public.assign_digimon_to_tamer(uuid, uuid, integer) from public, anon;
grant execute on function public.assign_digimon_to_tamer(uuid, uuid, integer) to authenticated;

update public.digirole_digimons
set evolution_state = jsonb_set(
  jsonb_set(
    coalesce(evolution_state, '{}'::jsonb),
    '{condensed}',
    'true'::jsonb,
    true
  ),
  '{condensedAt}',
  coalesce(evolution_state -> 'condensedAt', to_jsonb(now())),
  true
)
where tamer_id is not null
  and lower(coalesce(evolution_state ->> 'condensed', 'false')) <> 'true';

update public.digirole_tamers t
set condensed_count = greatest(t.condensed_count, linked.linked_count)
from (
  select tamer_id, count(*)::integer as linked_count
  from public.digirole_digimons
  where tamer_id is not null
  group by tamer_id
) linked
where t.id = linked.tamer_id;

notify pgrst, 'reload schema';
