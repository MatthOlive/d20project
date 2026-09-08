create or replace function public.set_digirole_form_victories(
  p_digimon_id uuid,
  p_victories integer
) returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_digimon public.digirole_digimons%rowtype;
  v_form public.digirole_forms%rowtype;
  v_required integer := 0;
  v_victories integer := greatest(coalesce(p_victories, 0), 0);
  v_newly_stabilized boolean := false;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_digimon
  from public.digirole_digimons
  where id = p_digimon_id
  for update;

  if v_digimon.id is null then raise exception 'Digimon not found'; end if;
  if not (
    public.can_edit_character(v_digimon.game_id, v_digimon.owner_id)
    or auth.uid() = any(coalesce(v_digimon.allowed_editors, array[]::uuid[]))
  ) then
    raise exception 'You cannot update this Digimon';
  end if;

  select * into v_form
  from public.digirole_forms
  where digimon_id = p_digimon_id
    and species_id = v_digimon.species_id
  for update;

  if v_form.digimon_id is null then raise exception 'Active form is not registered'; end if;

  select coalesce(stabilization_victories, 0) into v_required
  from public.digirole_species
  where id = v_form.species_id;

  v_newly_stabilized := not v_form.stabilized and v_victories >= v_required;

  update public.digirole_forms
  set victories = v_victories,
      stabilized = stabilized or v_newly_stabilized,
      stabilized_at = case when v_newly_stabilized then now() else stabilized_at end
  where digimon_id = p_digimon_id
    and species_id = v_digimon.species_id;

  update public.digirole_digimons
  set victories = v_victories,
      stabilized_forms = stabilized_forms + case when v_newly_stabilized then 1 else 0 end,
      evolution_state = case
        when v_newly_stabilized then evolution_state || '{"maintenanceDs":0}'::jsonb
        else evolution_state
      end
  where id = p_digimon_id;

  return jsonb_build_object(
    'victories', v_victories,
    'required', v_required,
    'stabilized', v_form.stabilized or v_newly_stabilized,
    'newlyStabilized', v_newly_stabilized
  );
end;
$$;

revoke all on function public.set_digirole_form_victories(uuid, integer) from public;
grant execute on function public.set_digirole_form_victories(uuid, integer) to authenticated;

