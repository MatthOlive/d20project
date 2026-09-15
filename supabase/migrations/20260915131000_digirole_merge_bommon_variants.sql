-- Bommon and its 2010 anime label describe the same species in DigiRole.
do $$
declare
  v_bommon uuid;
  v_variant uuid;
  v_variant_evolution text;
begin
  select id
    into v_bommon
    from public.digirole_species
   where lower(name) = 'bommon'
   limit 1;

  select id, evolution_text
    into v_variant, v_variant_evolution
    from public.digirole_species
   where lower(name) = 'bommon (2010 anime version)'
   limit 1;

  if v_bommon is null or v_variant is null then
    return;
  end if;

  update public.digirole_species canonical
     set available_fields = (
           select array_agg(field order by field)
             from (
               select distinct unnest(
                 coalesce(canonical.available_fields, '{}') ||
                 coalesce(variant.available_fields, '{}')
               ) as field
             ) merged_fields
         ),
         evolution_text = concat_ws(
           ' ; ',
           nullif(btrim(canonical.evolution_text), ''),
           nullif(btrim(v_variant_evolution), '')
         )
    from public.digirole_species variant
   where canonical.id = v_bommon
     and variant.id = v_variant;

  update public.digirole_digimons
     set species_id = v_bommon
   where species_id = v_variant;

  insert into public.digirole_scan_data(tamer_id, species_id, percentage, updated_at)
  select tamer_id, v_bommon, percentage, updated_at
    from public.digirole_scan_data
   where species_id = v_variant
  on conflict (tamer_id, species_id) do update
    set percentage = greatest(public.digirole_scan_data.percentage, excluded.percentage),
        updated_at = greatest(public.digirole_scan_data.updated_at, excluded.updated_at);
  delete from public.digirole_scan_data where species_id = v_variant;

  insert into public.digirole_forms(
    digimon_id, species_id, stabilized, victories, requirements_confirmed,
    unlocked_at, stabilized_at, notes
  )
  select digimon_id, v_bommon, stabilized, victories, requirements_confirmed,
         unlocked_at, stabilized_at, notes
    from public.digirole_forms
   where species_id = v_variant
  on conflict (digimon_id, species_id) do update
    set stabilized = public.digirole_forms.stabilized or excluded.stabilized,
        victories = greatest(public.digirole_forms.victories, excluded.victories),
        requirements_confirmed = public.digirole_forms.requirements_confirmed or excluded.requirements_confirmed,
        unlocked_at = least(public.digirole_forms.unlocked_at, excluded.unlocked_at),
        stabilized_at = coalesce(public.digirole_forms.stabilized_at, excluded.stabilized_at),
        notes = coalesce(public.digirole_forms.notes, excluded.notes);
  delete from public.digirole_forms where species_id = v_variant;

  insert into public.digirole_species_techniques(species_id, technique_id, is_signature)
  select v_bommon, technique_id, is_signature
    from public.digirole_species_techniques
   where species_id = v_variant
  on conflict (species_id, technique_id) do update
    set is_signature = public.digirole_species_techniques.is_signature or excluded.is_signature;

  insert into public.digirole_species_techniques(species_id, technique_id, is_signature)
  select v_bommon, id, true
    from public.digirole_techniques
   where lower(name) in ('crack-crack-crackle', 'bomberhead')
  on conflict (species_id, technique_id) do update
    set is_signature = true;

  delete from public.digirole_species where id = v_variant;
end $$;
