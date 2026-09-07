-- A form may only be unlocked or activated after the Digimon reaches its required rank.
create or replace function public.digirole_evolution_rank_order(p_stage text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_stage
    when 'In-Training I' then 0
    when 'In-Training II' then 1
    when 'Rookie' then 2
    when 'Armor' then 3
    when 'Hybrid' then 3
    when 'Champion' then 3
    when 'Jogress' then 4
    when 'Ultimate' then 4
    when 'Mega' then 5
    when 'Mega+' then 6
    else 999
  end;
$$;

create or replace function public.enforce_digirole_form_rank()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rank text;
  v_stage text;
begin
  select rank into v_rank
  from public.digirole_digimons
  where id = new.digimon_id;

  select stage into v_stage
  from public.digirole_species
  where id = new.species_id;

  if v_rank is null or public.digirole_evolution_rank_order(v_rank) = 999 then
    raise exception 'O rank atual do Digimon não é válido para Digievolução';
  end if;
  if v_stage is null or public.digirole_evolution_rank_order(v_stage) = 999 then
    raise exception 'O estágio da forma escolhida não é válido para Digievolução';
  end if;

  if public.digirole_evolution_rank_order(v_rank)
      < public.digirole_evolution_rank_order(v_stage) then
    raise exception 'O Digimon precisa alcançar o Rank % antes de desbloquear esta forma',
      case
        when v_stage in ('Armor', 'Hybrid') then 'Champion'
        when v_stage = 'Jogress' then 'Ultimate'
        else v_stage
      end;
  end if;

  return new;
end;
$$;

drop trigger if exists digirole_forms_require_rank on public.digirole_forms;
create trigger digirole_forms_require_rank
before insert or update of species_id on public.digirole_forms
for each row execute function public.enforce_digirole_form_rank();

create or replace function public.enforce_digirole_transformation_rank()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_stage text;
begin
  if new.species_id is not distinct from old.species_id then
    return new;
  end if;

  select stage into v_stage
  from public.digirole_species
  where id = new.species_id;

  if old.rank is null or public.digirole_evolution_rank_order(old.rank) = 999 then
    raise exception 'O rank atual do Digimon não é válido para Digievolução';
  end if;
  if v_stage is null or public.digirole_evolution_rank_order(v_stage) = 999 then
    raise exception 'O estágio da forma escolhida não é válido para Digievolução';
  end if;

  if public.digirole_evolution_rank_order(old.rank)
      < public.digirole_evolution_rank_order(v_stage) then
    raise exception 'O Digimon precisa alcançar o Rank % antes de Digievoluir',
      case
        when v_stage in ('Armor', 'Hybrid') then 'Champion'
        when v_stage = 'Jogress' then 'Ultimate'
        else v_stage
      end;
  end if;

  -- Evolution changes the active form, not the progression rank already earned.
  new.rank := old.rank;
  return new;
end;
$$;

drop trigger if exists digirole_digimons_require_rank_for_form on public.digirole_digimons;
create trigger digirole_digimons_require_rank_for_form
before update of species_id on public.digirole_digimons
for each row execute function public.enforce_digirole_transformation_rank();

revoke all on function public.digirole_evolution_rank_order(text) from public;
grant execute on function public.digirole_evolution_rank_order(text) to authenticated;
