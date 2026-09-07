-- PokéRole-style attribute breakdown and reliable signature-technique replacement.
alter table public.digirole_tamers
  add column if not exists attr_points jsonb not null default '{}'::jsonb;

alter table public.digirole_digimons
  add column if not exists attr_points jsonb not null default '{}'::jsonb;

create or replace function public.sync_digirole_signature_techniques()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  delete from public.digirole_digimon_techniques
  where digimon_id = new.id
    and source = 'signature';

  insert into public.digirole_digimon_techniques (digimon_id, technique_id, source)
  select new.id, link.technique_id, 'signature'
  from public.digirole_species_techniques link
  where link.species_id = new.species_id
    and link.is_signature
  on conflict (digimon_id, technique_id) do update
    set source = 'signature';

  return new;
end;
$$;

drop trigger if exists sync_digirole_signature_techniques_on_form on public.digirole_digimons;
create trigger sync_digirole_signature_techniques_on_form
after insert or update of species_id on public.digirole_digimons
for each row execute function public.sync_digirole_signature_techniques();

-- Repair existing sheets immediately when this migration is applied.
delete from public.digirole_digimon_techniques learned
where learned.source = 'signature';

insert into public.digirole_digimon_techniques (digimon_id, technique_id, source)
select digimon.id, link.technique_id, 'signature'
from public.digirole_digimons digimon
join public.digirole_species_techniques link
  on link.species_id = digimon.species_id
 and link.is_signature
on conflict (digimon_id, technique_id) do update
  set source = 'signature';
