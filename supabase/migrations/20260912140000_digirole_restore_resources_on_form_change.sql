-- Restore a Digimon's resources whenever its active form changes.
create or replace function public.restore_digirole_resources_after_form_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_species public.digirole_species%rowtype;
  v_vitality integer;
  v_spirit integer;
  v_hp_max integer;
  v_ds_max integer;
begin
  select * into v_species
  from public.digirole_species
  where id = new.species_id;

  if v_species.id is null then
    return new;
  end if;

  v_vitality := greatest(0, coalesce((new.attrs ->> 'vitality')::integer, 1));
  v_spirit := greatest(0, coalesce((new.attrs ->> 'spirit')::integer, 1));
  v_hp_max := greatest(1, coalesce(v_species.hp_base, 3) + v_vitality);
  v_ds_max := 2 + v_spirit + greatest(1, coalesce(new.stabilized_forms, 1));

  update public.digirole_digimons
  set hp_current = v_hp_max,
      ds_current = v_ds_max
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists digirole_restore_resources_after_form_change on public.digirole_digimons;
create trigger digirole_restore_resources_after_form_change
after update of species_id on public.digirole_digimons
for each row
when (old.species_id is distinct from new.species_id)
execute function public.restore_digirole_resources_after_form_change();

revoke all on function public.restore_digirole_resources_after_form_change() from public;
grant execute on function public.restore_digirole_resources_after_form_change() to authenticated;
