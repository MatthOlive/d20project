-- Refresh signature techniques on existing sheets while keeping learned generic techniques.
delete from public.digirole_digimon_techniques where source='signature';
insert into public.digirole_digimon_techniques(digimon_id,technique_id,source)
select digimon.id,link.technique_id,'signature'
from public.digirole_digimons digimon
join public.digirole_species_techniques link on link.species_id=digimon.species_id and link.is_signature
on conflict(digimon_id,technique_id) do update set source='signature';
notify pgrst, 'reload schema';
