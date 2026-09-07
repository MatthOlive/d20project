-- Normalize DigiRole signatures, remove legacy grade-less duplicates and enforce technique limits.
-- If a signature only exists in the legacy grade-less catalog, assign the grade of its species.
with missing_signature_grades as (
  select distinct on (technique.id)
    technique.id,
    case species.stage
      when 'In-Training I' then 'I' when 'In-Training II' then 'II' when 'Rookie' then 'III'
      when 'Champion' then 'IV' when 'Armor' then 'IV' when 'Hybrid' then 'IV'
      when 'Ultimate' then 'V' when 'Jogress' then 'V' when 'Mega' then 'VI'
      when 'Mega+' then 'VII' else 'I'
    end as inferred_grade
  from public.digirole_species species
  join public.digirole_species_techniques link on link.species_id = species.id
  join public.digirole_techniques technique on technique.id = link.technique_id
  where btrim(technique.grade) = ''
    and lower(btrim(technique.name)) = lower(btrim(species.signature_technique))
    and not exists (
      select 1
      from public.digirole_techniques graded
      where lower(btrim(graded.name)) = lower(btrim(species.signature_technique))
        and upper(btrim(graded.grade)) in ('I', 'II', 'III', 'IV', 'V', 'VI', 'VII')
    )
  order by technique.id, species.stage
)
update public.digirole_techniques technique
set grade = missing.inferred_grade
from missing_signature_grades missing
where technique.id = missing.id;

-- Share every graded technique that has identical rules, even when only its flavor text differs.
create temporary table _digirole_mechanical_merge on commit drop as
select duplicate_id, canonical_id
from (
  select
    technique.id as duplicate_id,
    first_value(technique.id) over (
      partition by
        lower(btrim(technique.name)),
        upper(btrim(technique.grade)),
        technique.ds_cost,
        lower(btrim(technique.field)),
        lower(btrim(technique.category)),
        lower(btrim(technique.target)),
        lower(btrim(technique.accuracy_formula)),
        lower(btrim(coalesce(technique.damage_formula, '')))
      order by length(technique.description) desc, technique.source_page desc nulls last, technique.id
    ) as canonical_id
  from public.digirole_techniques technique
  where upper(btrim(technique.grade)) in ('I', 'II', 'III', 'IV', 'V', 'VI', 'VII')
) ranked;

insert into public.digirole_species_techniques as existing_link (
  species_id,
  technique_id,
  is_signature,
  created_at
)
select
  link.species_id,
  merge.canonical_id,
  link.is_signature,
  link.created_at
from public.digirole_species_techniques link
join _digirole_mechanical_merge merge on merge.duplicate_id = link.technique_id
where merge.duplicate_id <> merge.canonical_id
on conflict (species_id, technique_id) do update
set is_signature = existing_link.is_signature or excluded.is_signature,
    created_at = least(existing_link.created_at, excluded.created_at);

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
join _digirole_mechanical_merge merge on merge.duplicate_id = learned.technique_id
where merge.duplicate_id <> merge.canonical_id
on conflict (digimon_id, technique_id) do update
set source = case
      when existing_technique.source = 'signature' or excluded.source = 'signature'
        then 'signature'
      else existing_technique.source
    end,
    created_at = least(existing_technique.created_at, excluded.created_at);

delete from public.digirole_digimon_techniques learned
using _digirole_mechanical_merge merge
where learned.technique_id = merge.duplicate_id
  and merge.duplicate_id <> merge.canonical_id;

delete from public.digirole_species_techniques link
using _digirole_mechanical_merge merge
where link.technique_id = merge.duplicate_id
  and merge.duplicate_id <> merge.canonical_id;

delete from public.digirole_techniques technique
using _digirole_mechanical_merge merge
where technique.id = merge.duplicate_id
  and merge.duplicate_id <> merge.canonical_id;

create temporary table _digirole_signature_choice on commit drop as
select species_id, technique_id
from (
  select
    species.id as species_id,
    technique.id as technique_id,
    row_number() over (
      partition by species.id
      order by
        case when btrim(technique.grade) <> '' then 0 else 1 end,
        case
          when case upper(btrim(technique.grade))
            when 'I' then 1 when 'II' then 2 when 'III' then 3 when 'IV' then 4
            when 'V' then 5 when 'VI' then 6 when 'VII' then 7 else 0
          end = case species.stage
            when 'In-Training I' then 1 when 'In-Training II' then 2 when 'Rookie' then 3
            when 'Champion' then 4 when 'Armor' then 4 when 'Hybrid' then 4
            when 'Ultimate' then 5 when 'Jogress' then 5 when 'Mega' then 6
            when 'Mega+' then 7 else 1
          end then 0 else 1
        end,
        length(technique.description) desc,
        technique.source_page desc nulls last,
        technique.id
    ) as choice_order
  from public.digirole_species species
  join public.digirole_species_techniques link on link.species_id = species.id
  join public.digirole_techniques technique on technique.id = link.technique_id
  where species.signature_technique is not null
    and btrim(species.signature_technique) <> ''
    and lower(btrim(technique.name)) = lower(btrim(species.signature_technique))
) ranked
where choice_order = 1;

-- Remove invalid techniques already added by the old name-only signature fallback.
delete from public.digirole_digimon_techniques learned
using public.digirole_techniques technique
where learned.technique_id = technique.id
  and btrim(technique.grade) = '';

update public.digirole_species_techniques
set is_signature = false
where is_signature;

update public.digirole_species_techniques link
set is_signature = true
from _digirole_signature_choice choice
where link.species_id = choice.species_id
  and link.technique_id = choice.technique_id;

-- Keep only the canonical signature association for each species.
delete from public.digirole_species_techniques link
using public.digirole_species species,
      public.digirole_techniques technique,
      _digirole_signature_choice choice
where link.species_id = species.id
  and link.technique_id = technique.id
  and choice.species_id = species.id
  and lower(btrim(technique.name)) = lower(btrim(species.signature_technique))
  and link.technique_id <> choice.technique_id;

delete from public.digirole_digimon_techniques
where source = 'signature';

insert into public.digirole_digimon_techniques (digimon_id, technique_id, source)
select digimon.id, choice.technique_id, 'signature'
from public.digirole_digimons digimon
join _digirole_signature_choice choice on choice.species_id = digimon.species_id
on conflict (digimon_id, technique_id) do update
set source = 'signature';

delete from public.digirole_techniques technique
where btrim(technique.grade) = ''
  and not exists (
    select 1 from public.digirole_species_techniques link
    where link.technique_id = technique.id
  )
  and not exists (
    select 1 from public.digirole_digimon_techniques learned
    where learned.technique_id = technique.id
  );

-- Existing sheets keep their oldest valid generic techniques up to 2 + total Wisdom.
with ranked_generics as (
  select
    learned.digimon_id,
    learned.technique_id,
    row_number() over (
      partition by learned.digimon_id
      order by learned.created_at, learned.technique_id
    ) as technique_order,
    greatest(
      0,
      2
      + coalesce(nullif(digimon.attrs ->> 'wisdom', '')::integer, 1)
      + coalesce(nullif(digimon.attr_points ->> 'wisdom', '')::integer, 0)
      + coalesce(nullif(digimon.bonuses ->> 'wisdom', '')::integer, 0)
    ) as technique_limit
  from public.digirole_digimon_techniques learned
  join public.digirole_digimons digimon on digimon.id = learned.digimon_id
  where learned.source <> 'signature'
)
delete from public.digirole_digimon_techniques learned
using ranked_generics ranked
where learned.digimon_id = ranked.digimon_id
  and learned.technique_id = ranked.technique_id
  and ranked.technique_order > ranked.technique_limit;

create or replace function public.enforce_digirole_technique_rules()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_species_id uuid;
  v_rank text;
  v_wisdom integer;
  v_grade integer;
  v_max_grade integer;
  v_limit integer;
  v_current integer;
  v_signature_id uuid;
begin
  select
    digimon.species_id,
    digimon.rank,
    coalesce(nullif(digimon.attrs ->> 'wisdom', '')::integer, 1)
      + coalesce(nullif(digimon.attr_points ->> 'wisdom', '')::integer, 0)
      + coalesce(nullif(digimon.bonuses ->> 'wisdom', '')::integer, 0)
  into v_species_id, v_rank, v_wisdom
  from public.digirole_digimons digimon
  where digimon.id = new.digimon_id;

  if not found then
    raise exception 'Ficha de Digimon não encontrada';
  end if;

  if new.source = 'signature' then
    select link.technique_id into v_signature_id
    from public.digirole_species_techniques link
    where link.species_id = v_species_id
      and link.is_signature
    order by link.created_at, link.technique_id
    limit 1;

    if v_signature_id is null then
      raise exception 'A espécie atual não possui técnica assinatura cadastrada';
    end if;
    new.technique_id := v_signature_id;
    return new;
  end if;

  select case upper(btrim(technique.grade))
    when 'I' then 1 when 'II' then 2 when 'III' then 3 when 'IV' then 4
    when 'V' then 5 when 'VI' then 6 when 'VII' then 7 else 0
  end
  into v_grade
  from public.digirole_techniques technique
  where technique.id = new.technique_id;

  v_max_grade := case v_rank
    when 'In-Training I' then 1 when 'In-Training II' then 2 when 'Rookie' then 3
    when 'Champion' then 4 when 'Armor' then 4 when 'Hybrid' then 4
    when 'Ultimate' then 5 when 'Jogress' then 5 when 'Mega' then 6
    when 'Mega+' then 7 else 1
  end;

  if coalesce(v_grade, 0) = 0 then
    raise exception 'Esta técnica não possui grau válido';
  end if;
  if v_grade > v_max_grade then
    raise exception 'Grau % indisponível para o Rank %', v_grade, v_rank;
  end if;

  v_limit := greatest(0, 2 + v_wisdom);
  select count(*) into v_current
  from public.digirole_digimon_techniques learned
  where learned.digimon_id = new.digimon_id
    and learned.source <> 'signature';

  if tg_op = 'UPDATE'
    and old.digimon_id = new.digimon_id
    and old.source <> 'signature' then
    v_current := greatest(0, v_current - 1);
  end if;

  if v_current >= v_limit then
    raise exception 'Limite de % técnicas genéricas atingido (2 + Sabedoria)', v_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_digirole_technique_rules_trigger
  on public.digirole_digimon_techniques;
create trigger enforce_digirole_technique_rules_trigger
before insert or update of digimon_id, technique_id, source
on public.digirole_digimon_techniques
for each row execute function public.enforce_digirole_technique_rules();
