-- DigiRole is isolated from Pokerole data while sharing the VTT, permissions and token engine.
create table if not exists public.digirole_species (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  stage text not null check (stage in ('In-Training I','In-Training II','Rookie','Champion','Ultimate','Mega','Mega+')),
  digi_attribute text not null default 'None',
  species_type text,
  fields text[] not null default '{}',
  available_fields text[] not null default '{}',
  hp_base integer not null default 3 check (hp_base > 0),
  suggested_hp integer,
  stabilization_text text,
  stabilization_victories integer not null default 0,
  base_attrs jsonb not null default '{"strength":1,"dexterity":1,"vitality":1,"wisdom":1,"spirit":1,"charisma":1}'::jsonb,
  signature_technique text,
  evolution_text text,
  image_url text,
  source_page integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.digirole_techniques (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  origin text not null default '',
  grade text not null default '',
  ds_cost integer not null default 0,
  field text not null default 'Neutra',
  category text not null default 'Energia',
  target text not null default '1 alvo',
  accuracy_formula text not null default 'DEX + Fight',
  damage_formula text,
  description text not null default '',
  source_page integer,
  unique(name, origin, grade)
);

create table if not exists public.digirole_tamers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Novo Tamer',
  image_url text,
  folder text,
  age integer not null default 13 check (age >= 0),
  rank text not null default 'In-Training I',
  attrs jsonb not null default '{"strength":1,"dexterity":1,"vitality":1,"wisdom":1,"spirit":1,"charisma":1}'::jsonb,
  skills jsonb not null default '{}',
  notoriety jsonb not null default '{"Connections":0,"Fame":0,"Sponsors":0,"Supporters":0}'::jsonb,
  hp_current integer not null default 4,
  ds_current integer not null default 3,
  condensed_count integer not null default 0,
  conditions text[] not null default '{}',
  inventory jsonb not null default '[]'::jsonb,
  achievements jsonb not null default '[]'::jsonb,
  notes text,
  allowed_viewers uuid[] not null default '{}',
  allowed_editors uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.digirole_digimons (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tamer_id uuid references public.digirole_tamers(id) on delete set null,
  species_id uuid references public.digirole_species(id) on delete set null,
  nickname text,
  image_url text,
  folder text,
  rank text not null default 'In-Training I',
  attrs jsonb not null default '{"strength":1,"dexterity":1,"vitality":1,"wisdom":1,"spirit":1,"charisma":1}'::jsonb,
  skills jsonb not null default '{}',
  hp_current integer not null default 4,
  ds_current integer not null default 4,
  bond integer not null default 0 check (bond between 0 and 5),
  pe integer not null default 0,
  battles integer not null default 0,
  victories integer not null default 0,
  training_successes integer not null default 0,
  stabilized_forms integer not null default 1,
  conditions text[] not null default '{}',
  evolution_state jsonb not null default '{}'::jsonb,
  notes text,
  allowed_viewers uuid[] not null default '{}',
  allowed_editors uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.digirole_digimon_techniques (
  digimon_id uuid not null references public.digirole_digimons(id) on delete cascade,
  technique_id uuid not null references public.digirole_techniques(id) on delete cascade,
  source text not null default 'learned',
  created_at timestamptz not null default now(),
  primary key (digimon_id, technique_id)
);

create table if not exists public.digirole_scan_data (
  tamer_id uuid not null references public.digirole_tamers(id) on delete cascade,
  species_id uuid not null references public.digirole_species(id) on delete cascade,
  percentage integer not null default 0 check (percentage between 0 and 200),
  updated_at timestamptz not null default now(),
  primary key (tamer_id, species_id)
);

create index if not exists digirole_tamers_game_idx on public.digirole_tamers(game_id);
create index if not exists digirole_digimons_game_idx on public.digirole_digimons(game_id);
create index if not exists digirole_digimons_tamer_idx on public.digirole_digimons(tamer_id);
create index if not exists digirole_species_stage_name_idx on public.digirole_species(stage, name);
create index if not exists digirole_techniques_name_idx on public.digirole_techniques(name);

drop trigger if exists digirole_species_set_updated_at on public.digirole_species;
create trigger digirole_species_set_updated_at before update on public.digirole_species
for each row execute function public.set_updated_at();
drop trigger if exists digirole_tamers_set_updated_at on public.digirole_tamers;
create trigger digirole_tamers_set_updated_at before update on public.digirole_tamers
for each row execute function public.set_updated_at();
drop trigger if exists digirole_digimons_set_updated_at on public.digirole_digimons;
create trigger digirole_digimons_set_updated_at before update on public.digirole_digimons
for each row execute function public.set_updated_at();

alter table public.digirole_species enable row level security;
alter table public.digirole_techniques enable row level security;
alter table public.digirole_tamers enable row level security;
alter table public.digirole_digimons enable row level security;
alter table public.digirole_digimon_techniques enable row level security;
alter table public.digirole_scan_data enable row level security;

create policy "authenticated view digirole species" on public.digirole_species
for select to authenticated using (true);
create policy "authenticated view digirole techniques" on public.digirole_techniques
for select to authenticated using (true);

create policy "members view digirole tamers" on public.digirole_tamers
for select to authenticated using (
  public.is_game_member(game_id, auth.uid()) and (
    cardinality(allowed_viewers) = 0 or owner_id = auth.uid()
    or public.is_game_narrator(game_id, auth.uid())
    or auth.uid() = any(allowed_viewers) or auth.uid() = any(allowed_editors)
  )
);
create policy "members create own digirole tamers" on public.digirole_tamers
for insert to authenticated with check (owner_id = auth.uid() and public.is_game_member(game_id, auth.uid()));
create policy "controllers update digirole tamers" on public.digirole_tamers
for update to authenticated using (
  public.can_edit_character(game_id, owner_id) or auth.uid() = any(allowed_editors)
) with check (
  public.can_edit_character(game_id, owner_id) or auth.uid() = any(allowed_editors)
);
create policy "controllers delete digirole tamers" on public.digirole_tamers
for delete to authenticated using (
  public.can_edit_character(game_id, owner_id) or auth.uid() = any(allowed_editors)
);

create policy "members view digirole digimons" on public.digirole_digimons
for select to authenticated using (
  public.is_game_member(game_id, auth.uid()) and (
    cardinality(allowed_viewers) = 0 or owner_id = auth.uid()
    or public.is_game_narrator(game_id, auth.uid())
    or auth.uid() = any(allowed_viewers) or auth.uid() = any(allowed_editors)
  )
);
create policy "members create own digirole digimons" on public.digirole_digimons
for insert to authenticated with check (owner_id = auth.uid() and public.is_game_member(game_id, auth.uid()));
create policy "controllers update digirole digimons" on public.digirole_digimons
for update to authenticated using (
  public.can_edit_character(game_id, owner_id) or auth.uid() = any(allowed_editors)
) with check (
  public.can_edit_character(game_id, owner_id) or auth.uid() = any(allowed_editors)
);
create policy "controllers delete digirole digimons" on public.digirole_digimons
for delete to authenticated using (
  public.can_edit_character(game_id, owner_id) or auth.uid() = any(allowed_editors)
);

create policy "members view digirole learned techniques" on public.digirole_digimon_techniques
for select to authenticated using (exists (
  select 1 from public.digirole_digimons d
  where d.id = digimon_id and public.is_game_member(d.game_id, auth.uid())
));
create policy "controllers manage digirole learned techniques" on public.digirole_digimon_techniques
for all to authenticated using (exists (
  select 1 from public.digirole_digimons d where d.id = digimon_id
  and (public.can_edit_character(d.game_id, d.owner_id) or auth.uid() = any(d.allowed_editors))
)) with check (exists (
  select 1 from public.digirole_digimons d where d.id = digimon_id
  and (public.can_edit_character(d.game_id, d.owner_id) or auth.uid() = any(d.allowed_editors))
));

create policy "members view digirole scans" on public.digirole_scan_data
for select to authenticated using (exists (
  select 1 from public.digirole_tamers t
  where t.id = tamer_id and public.is_game_member(t.game_id, auth.uid())
));
create policy "controllers manage digirole scans" on public.digirole_scan_data
for all to authenticated using (exists (
  select 1 from public.digirole_tamers t where t.id = tamer_id
  and (public.can_edit_character(t.game_id, t.owner_id) or auth.uid() = any(t.allowed_editors))
)) with check (exists (
  select 1 from public.digirole_tamers t where t.id = tamer_id
  and (public.can_edit_character(t.game_id, t.owner_id) or auth.uid() = any(t.allowed_editors))
));

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.tokens'::regclass and conname = 'tokens_character_kind_check'
  ) then
    alter table public.tokens drop constraint tokens_character_kind_check;
  end if;
end $$;
alter table public.tokens add constraint tokens_character_kind_check
check (character_kind in ('pokemon','trainer','t20','digirole_tamer','digirole_digimon'));

create or replace function public.can_view_character(_game uuid, _kind text, _character uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when _kind = 'pokemon' then exists (
      select 1 from public.pokemon p left join public.trainers t on t.id = p.owner_trainer_id
      where p.id = _character and p.game_id = _game and public.is_game_member(p.game_id, auth.uid()) and (
        coalesce(cardinality(p.allowed_viewers), 0) = 0 or p.owner_id = auth.uid()
        or public.is_game_narrator(p.game_id, auth.uid())
        or auth.uid() = any(coalesce(p.allowed_viewers, array[]::uuid[]))
        or auth.uid() = any(coalesce(p.allowed_editors, array[]::uuid[]))
        or (t.id is not null and (t.owner_id = auth.uid()
          or auth.uid() = any(coalesce(t.allowed_viewers, array[]::uuid[]))
          or auth.uid() = any(coalesce(t.allowed_editors, array[]::uuid[]))))
      )
    )
    when _kind = 'trainer' then exists (
      select 1 from public.trainers t where t.id = _character and t.game_id = _game
      and (public.is_game_member(t.game_id, auth.uid()) or public.is_game_narrator(t.game_id, auth.uid())) and (
        coalesce(cardinality(t.allowed_viewers), 0) = 0 or t.owner_id = auth.uid()
        or public.is_game_narrator(t.game_id, auth.uid())
        or auth.uid() = any(coalesce(t.allowed_viewers, array[]::uuid[]))
        or auth.uid() = any(coalesce(t.allowed_editors, array[]::uuid[]))
      )
    )
    when _kind = 't20' then exists (
      select 1 from public.t20_characters c where c.id = _character and c.game_id = _game
      and public.is_game_member(c.game_id, auth.uid()) and (
        coalesce(cardinality(c.allowed_viewers), 0) = 0 or c.owner_id = auth.uid()
        or public.is_game_narrator(c.game_id, auth.uid())
        or auth.uid() = any(coalesce(c.allowed_viewers, array[]::uuid[]))
        or auth.uid() = any(coalesce(c.allowed_editors, array[]::uuid[]))
      )
    )
    when _kind = 'digirole_tamer' then exists (
      select 1 from public.digirole_tamers c where c.id = _character and c.game_id = _game
      and public.is_game_member(c.game_id, auth.uid()) and (
        cardinality(c.allowed_viewers) = 0 or c.owner_id = auth.uid()
        or public.is_game_narrator(c.game_id, auth.uid()) or auth.uid() = any(c.allowed_viewers)
        or auth.uid() = any(c.allowed_editors)
      )
    )
    when _kind = 'digirole_digimon' then exists (
      select 1 from public.digirole_digimons c where c.id = _character and c.game_id = _game
      and public.is_game_member(c.game_id, auth.uid()) and (
        cardinality(c.allowed_viewers) = 0 or c.owner_id = auth.uid()
        or public.is_game_narrator(c.game_id, auth.uid()) or auth.uid() = any(c.allowed_viewers)
        or auth.uid() = any(c.allowed_editors)
      )
    )
    else false
  end;
$$;

create or replace function public.can_edit_token(_game uuid, _kind text, _character uuid, _token_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_edit_character(_game, _token_owner) or case
    when _kind = 'pokemon' then exists (select 1 from public.pokemon p where p.id = _character and auth.uid() = any(p.allowed_editors))
    when _kind = 'trainer' then exists (select 1 from public.trainers t where t.id = _character and auth.uid() = any(t.allowed_editors))
    when _kind = 't20' then exists (select 1 from public.t20_characters c where c.id = _character and auth.uid() = any(c.allowed_editors))
    when _kind = 'digirole_tamer' then exists (select 1 from public.digirole_tamers c where c.id = _character and auth.uid() = any(c.allowed_editors))
    when _kind = 'digirole_digimon' then exists (select 1 from public.digirole_digimons c where c.id = _character and auth.uid() = any(c.allowed_editors))
    else false
  end;
$$;

create or replace function public.set_character_folder(p_kind text, p_character_id uuid, p_folder text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_game_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  if p_kind = 'pokemon' then
    select game_id into v_game_id from public.pokemon where id = p_character_id;
  elsif p_kind = 'trainer' then
    select game_id into v_game_id from public.trainers where id = p_character_id;
  elsif p_kind = 't20' then
    select game_id into v_game_id from public.t20_characters where id = p_character_id;
  elsif p_kind = 'digirole_tamer' then
    select game_id into v_game_id from public.digirole_tamers where id = p_character_id;
  elsif p_kind = 'digirole_digimon' then
    select game_id into v_game_id from public.digirole_digimons where id = p_character_id;
  else
    raise exception 'Invalid character kind: %', p_kind;
  end if;

  if v_game_id is null then raise exception 'Character not found'; end if;
  if not public.can_view_character(v_game_id, p_kind, p_character_id) then
    raise exception 'You cannot organize this character';
  end if;

  if p_kind = 'pokemon' then
    update public.pokemon set folder = nullif(trim(p_folder), '') where id = p_character_id;
  elsif p_kind = 'trainer' then
    update public.trainers set folder = nullif(trim(p_folder), '') where id = p_character_id;
  elsif p_kind = 't20' then
    update public.t20_characters set folder = nullif(trim(p_folder), '') where id = p_character_id;
  elsif p_kind = 'digirole_tamer' then
    update public.digirole_tamers set folder = nullif(trim(p_folder), '') where id = p_character_id;
  elsif p_kind = 'digirole_digimon' then
    update public.digirole_digimons set folder = nullif(trim(p_folder), '') where id = p_character_id;
  end if;
end;
$$;
grant execute on function public.set_character_folder(text, uuid, text) to authenticated;

create or replace function public.create_token_from_character(
  p_game_id uuid, p_page_id uuid, p_character_kind text, p_character_id uuid,
  p_label text, p_image_url text, p_x double precision, p_y double precision
) returns uuid language plpgsql security definer set search_path = public set row_security = off as $$
declare
  v_character_owner_id uuid;
  v_token_owner_id uuid;
  v_token_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_game_member(p_game_id, auth.uid()) then raise exception 'You are not a member of this game'; end if;
  if not exists (select 1 from public.scenarios s where s.id = p_page_id and s.game_id = p_game_id) then
    raise exception 'Page does not belong to this game';
  end if;
  if not public.can_view_character(p_game_id, p_character_kind, p_character_id) then
    raise exception 'You cannot place this character on the map';
  end if;

  if p_character_kind = 'pokemon' then select owner_id into v_character_owner_id from public.pokemon where id = p_character_id and game_id = p_game_id;
  elsif p_character_kind = 'trainer' then select owner_id into v_character_owner_id from public.trainers where id = p_character_id and game_id = p_game_id;
  elsif p_character_kind = 't20' then select owner_id into v_character_owner_id from public.t20_characters where id = p_character_id and game_id = p_game_id;
  elsif p_character_kind = 'digirole_tamer' then select owner_id into v_character_owner_id from public.digirole_tamers where id = p_character_id and game_id = p_game_id;
  elsif p_character_kind = 'digirole_digimon' then select owner_id into v_character_owner_id from public.digirole_digimons where id = p_character_id and game_id = p_game_id;
  else raise exception 'Invalid character kind: %', p_character_kind;
  end if;
  if v_character_owner_id is null then raise exception 'Character not found'; end if;

  v_token_owner_id := case when public.can_edit_character(p_game_id, v_character_owner_id)
    then v_character_owner_id else auth.uid() end;
  insert into public.tokens(game_id,page_id,character_kind,character_id,label,image_url,owner_id,x,y)
  values (p_game_id,p_page_id,p_character_kind,p_character_id,p_label,p_image_url,v_token_owner_id,p_x,p_y)
  returning id into v_token_id;
  return v_token_id;
end;
$$;
grant execute on function public.create_token_from_character(uuid, uuid, text, uuid, text, text, double precision, double precision) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.digirole_tamers;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.digirole_digimons;
exception when duplicate_object then null;
end $$;
alter table public.digirole_tamers replica identity full;
alter table public.digirole_digimons replica identity full;
