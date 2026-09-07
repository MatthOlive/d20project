-- Convert the legacy signature name into structured species links. The
-- spreadsheet can add more than one signature link; the legacy field remains
-- a fallback for older catalog rows.
insert into public.digirole_species_techniques as existing_link (
  species_id,
  technique_id,
  is_signature
)
select
  species.id,
  signature.id,
  true
from public.digirole_species species
cross join lateral (
  select technique.id
  from public.digirole_techniques technique
  where lower(btrim(technique.name)) = lower(btrim(species.signature_technique))
  order by
    case when lower(btrim(technique.origin)) = lower(btrim(species.name)) then 0 else 1 end,
    technique.source_page nulls last,
    technique.id
  limit 1
) signature
where species.signature_technique is not null
  and btrim(species.signature_technique) <> ''
on conflict (species_id, technique_id) do update
set is_signature = existing_link.is_signature or excluded.is_signature;

create or replace function public.sync_digirole_signature_techniques()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'UPDATE' and old.species_id is distinct from new.species_id then
    delete from public.digirole_digimon_techniques
    where digimon_id = new.id
      and source = 'signature';
  end if;

  insert into public.digirole_species_techniques as existing_link (
    species_id,
    technique_id,
    is_signature
  )
  select
    species.id,
    signature.id,
    true
  from public.digirole_species species
  cross join lateral (
    select technique.id
    from public.digirole_techniques technique
    where lower(btrim(technique.name)) = lower(btrim(species.signature_technique))
    order by
      case when lower(btrim(technique.origin)) = lower(btrim(species.name)) then 0 else 1 end,
      technique.source_page nulls last,
      technique.id
    limit 1
  ) signature
  where species.id = new.species_id
    and species.signature_technique is not null
    and btrim(species.signature_technique) <> ''
  on conflict (species_id, technique_id) do update
  set is_signature = existing_link.is_signature or excluded.is_signature;

  insert into public.digirole_digimon_techniques (
    digimon_id,
    technique_id,
    source
  )
  select
    new.id,
    link.technique_id,
    'signature'
  from public.digirole_species_techniques link
  where link.species_id = new.species_id
    and link.is_signature
  on conflict (digimon_id, technique_id) do update
  set source = 'signature';

  return new;
end;
$$;

insert into public.digirole_digimon_techniques (
  digimon_id,
  technique_id,
  source
)
select
  digimon.id,
  link.technique_id,
  'signature'
from public.digirole_digimons digimon
join public.digirole_species_techniques link
  on link.species_id = digimon.species_id
 and link.is_signature
on conflict (digimon_id, technique_id) do update
set source = 'signature';
