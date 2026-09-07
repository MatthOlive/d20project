-- Keep every signature technique attached to a Digimon while excluding them
-- from the 2 + Wisdom limit applied to learned generic techniques.
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
    if not exists (
      select 1
      from public.digirole_species_techniques link
      where link.species_id = v_species_id
        and link.technique_id = new.technique_id
        and link.is_signature
    ) then
      raise exception 'Esta técnica não é uma assinatura da espécie atual';
    end if;
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

drop trigger if exists sync_digirole_signature_techniques_trigger
  on public.digirole_digimons;
create constraint trigger sync_digirole_signature_techniques_trigger
after insert or update of species_id
on public.digirole_digimons
deferrable initially deferred
for each row execute function public.sync_digirole_signature_techniques();

delete from public.digirole_digimon_techniques learned
using public.digirole_digimons digimon
where learned.digimon_id = digimon.id
  and learned.source = 'signature'
  and not exists (
    select 1
    from public.digirole_species_techniques link
    where link.species_id = digimon.species_id
      and link.technique_id = learned.technique_id
      and link.is_signature
  );

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
