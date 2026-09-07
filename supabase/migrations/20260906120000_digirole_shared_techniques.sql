-- Share identical DigiRole techniques between species instead of duplicating catalog rows.
create table if not exists public.digirole_species_techniques (
  species_id uuid not null references public.digirole_species(id) on delete cascade,
  technique_id uuid not null references public.digirole_techniques(id) on delete cascade,
  is_signature boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (species_id, technique_id)
);

create index if not exists digirole_species_techniques_technique_idx
  on public.digirole_species_techniques(technique_id);

alter table public.digirole_species_techniques enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'digirole_species_techniques'
      and policyname = 'authenticated view digirole species techniques'
  ) then
    create policy "authenticated view digirole species techniques"
      on public.digirole_species_techniques
      for select to authenticated using (true);
  end if;
end $$;

create temporary table _digirole_technique_merge on commit drop as
select
  id as duplicate_id,
  first_value(id) over (
    partition by
      lower(btrim(name)),
      lower(btrim(grade)),
      ds_cost,
      lower(btrim(field)),
      lower(btrim(category)),
      lower(btrim(target)),
      lower(btrim(accuracy_formula)),
      lower(btrim(coalesce(damage_formula, ''))),
      md5(lower(btrim(description)))
    order by
      case when btrim(origin) = '' then 0 else 1 end,
      source_page nulls last,
      id
  ) as canonical_id
from public.digirole_techniques;

-- Preserve every species association that used to be encoded in origin.
insert into public.digirole_species_techniques as existing_link (
  species_id,
  technique_id,
  is_signature
)
select
  species.id,
  merge.canonical_id,
  lower(btrim(technique.name)) = lower(btrim(coalesce(species.signature_technique, '')))
from public.digirole_techniques technique
join public.digirole_species species
  on lower(btrim(species.name)) = lower(btrim(technique.origin))
join _digirole_technique_merge merge
  on merge.duplicate_id = technique.id
on conflict (species_id, technique_id) do update
set is_signature = existing_link.is_signature or excluded.is_signature;

-- Some source rows only identify the signature by name. Keep that relation too.
insert into public.digirole_species_techniques as existing_link (
  species_id,
  technique_id,
  is_signature
)
select species.id, signature.canonical_id, true
from public.digirole_species species
cross join lateral (
  select merge.canonical_id
  from public.digirole_techniques technique
  join _digirole_technique_merge merge
    on merge.duplicate_id = technique.id
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

-- Move learned techniques to their canonical row before removing duplicates.
insert into public.digirole_digimon_techniques as existing_technique (
  digimon_id,
  technique_id,
  source,
  created_at
)
select
  learned.digimon_id,
  merge.canonical_id,
  learned.source,
  learned.created_at
from public.digirole_digimon_techniques learned
join _digirole_technique_merge merge
  on merge.duplicate_id = learned.technique_id
where merge.duplicate_id <> merge.canonical_id
on conflict (digimon_id, technique_id) do update
set source = case
  when existing_technique.source = 'signature' or excluded.source = 'signature' then 'signature'
  else existing_technique.source
end;

delete from public.digirole_digimon_techniques learned
using _digirole_technique_merge merge
where learned.technique_id = merge.duplicate_id
  and merge.duplicate_id <> merge.canonical_id;

delete from public.digirole_techniques technique
using _digirole_technique_merge merge
where technique.id = merge.duplicate_id
  and merge.duplicate_id <> merge.canonical_id;

alter table public.digirole_techniques
  drop constraint if exists digirole_techniques_name_origin_grade_key;

-- Origin is now represented by digirole_species_techniques.
update public.digirole_techniques set origin = '' where origin <> '';

create unique index if not exists digirole_techniques_content_key
  on public.digirole_techniques (
    lower(btrim(name)),
    lower(btrim(grade)),
    ds_cost,
    lower(btrim(field)),
    lower(btrim(category)),
    lower(btrim(target)),
    lower(btrim(accuracy_formula)),
    lower(btrim(coalesce(damage_formula, ''))),
    md5(lower(btrim(description)))
  );

create or replace function public.digirole_signature_technique_id(p_species_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select species_technique.technique_id
  from public.digirole_species_techniques species_technique
  where species_technique.species_id = p_species_id
    and species_technique.is_signature
  order by species_technique.created_at, species_technique.technique_id
  limit 1
$$;

revoke all on function public.digirole_signature_technique_id(uuid) from public;
grant execute on function public.digirole_signature_technique_id(uuid) to authenticated;
