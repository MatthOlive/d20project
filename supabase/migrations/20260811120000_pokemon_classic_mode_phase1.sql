-- Pokemon Classic mode, phase 1: Kanto / Pallet prototype.

alter table public.games
  drop constraint if exists games_narrator_type_check;

alter table public.games
  add constraint games_narrator_type_check
  check (narrator_type in ('human', 'ai', 'classic'));

alter table public.games
  add column if not exists classic_region text,
  add column if not exists classic_start_city text;

alter table public.games
  drop constraint if exists games_classic_region_check;

alter table public.games
  add constraint games_classic_region_check check (
    classic_region is null or classic_region in (
      'kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos',
      'alola', 'galar', 'paldea', 'hisui', 'lumiose_za'
    )
  );

create table if not exists public.classic_campaigns (
  game_id uuid primary key references public.games(id) on delete cascade,
  region text not null default 'kanto',
  start_city text not null default 'pallet',
  story_key text not null default 'kanto_pallet_v1',
  world_flags jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{"badge_rank_mode":"regional","party_scaling":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classic_player_progress (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trainer_id uuid references public.trainers(id) on delete set null,
  starter_pokemon_id uuid references public.pokemon(id) on delete set null,
  home_region text not null default 'kanto',
  current_region text not null default 'kanto',
  home_city text not null default 'pallet',
  current_city text not null default 'pallet',
  regional_badges jsonb not null default '{"kanto":[]}'::jsonb,
  story_step text not null default 'meet_professor',
  story_flags jsonb not null default '{}'::jsonb,
  travel_unlocks jsonb not null default '{}'::jsonb,
  money integer not null default 3000 check (money >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

alter table public.classic_campaigns enable row level security;
alter table public.classic_player_progress enable row level security;

drop policy if exists "classic campaign visible to members" on public.classic_campaigns;
create policy "classic campaign visible to members"
  on public.classic_campaigns for select to authenticated
  using (public.is_game_member(game_id, auth.uid()) or public.is_game_narrator(game_id, auth.uid()));

drop policy if exists "classic campaign managed by owner" on public.classic_campaigns;
create policy "classic campaign managed by owner"
  on public.classic_campaigns for all to authenticated
  using (public.is_game_narrator(game_id, auth.uid()))
  with check (public.is_game_narrator(game_id, auth.uid()));

drop policy if exists "classic progress visible to members" on public.classic_player_progress;
create policy "classic progress visible to members"
  on public.classic_player_progress for select to authenticated
  using (public.is_game_member(game_id, auth.uid()) or public.is_game_narrator(game_id, auth.uid()));

drop policy if exists "players create own classic progress" on public.classic_player_progress;
create policy "players create own classic progress"
  on public.classic_player_progress for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_game_member(game_id, auth.uid())
  );

drop policy if exists "players update own classic progress" on public.classic_player_progress;
create policy "players update own classic progress"
  on public.classic_player_progress for update to authenticated
  using (user_id = auth.uid() or public.is_game_narrator(game_id, auth.uid()))
  with check (user_id = auth.uid() or public.is_game_narrator(game_id, auth.uid()));

grant select, insert, update, delete on public.classic_campaigns to authenticated;
grant select, insert, update on public.classic_player_progress to authenticated;
grant select (classic_region, classic_start_city) on public.games to authenticated;

create index if not exists classic_player_progress_trainer_idx
  on public.classic_player_progress(trainer_id);

create index if not exists classic_player_progress_region_idx
  on public.classic_player_progress(game_id, current_region);

create or replace function public.classic_rank_allowed(
  p_game_id uuid,
  p_user_id uuid,
  p_rank public.pokerole_rank
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_narrator_type text;
  v_region text;
  v_badges jsonb;
  v_badge_count integer := 0;
  v_allowed_index integer := 1;
  v_rank_index integer := 0;
begin
  select narrator_type into v_narrator_type
  from public.games
  where id = p_game_id;

  if coalesce(v_narrator_type, 'human') <> 'classic' then
    return true;
  end if;

  select current_region, regional_badges
    into v_region, v_badges
  from public.classic_player_progress
  where game_id = p_game_id and user_id = p_user_id;

  v_region := coalesce(v_region, 'kanto');
  if jsonb_typeof(v_badges -> v_region) = 'array' then
    v_badge_count := jsonb_array_length(v_badges -> v_region);
  elsif jsonb_typeof(v_badges -> v_region) = 'number' then
    v_badge_count := greatest(0, (v_badges ->> v_region)::integer);
  end if;

  v_allowed_index := case
    when v_badge_count <= 0 then 1
    when v_badge_count <= 2 then 2
    when v_badge_count <= 4 then 3
    when v_badge_count <= 6 then 4
    else 5
  end;

  v_rank_index := case p_rank::text
    when 'starter' then 0
    when 'beginner' then 1
    when 'amateur' then 2
    when 'ace' then 3
    when 'pro' then 4
    when 'master' then 5
    else 99
  end;

  return v_rank_index <= v_allowed_index;
end;
$$;

grant execute on function public.classic_rank_allowed(uuid, uuid, public.pokerole_rank) to authenticated;

create or replace function public.enforce_classic_token_rank()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank public.pokerole_rank;
begin
  if new.character_kind <> 'pokemon' then
    return new;
  end if;

  select rank into v_rank
  from public.pokemon
  where id = new.character_id and game_id = new.game_id;

  if v_rank is not null and not public.classic_rank_allowed(new.game_id, auth.uid(), v_rank) then
    raise exception 'Este Pokemon esta acima do rank permitido pelas suas insignias nesta regiao';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_classic_token_rank on public.tokens;
create trigger enforce_classic_token_rank
  before insert on public.tokens
  for each row execute function public.enforce_classic_token_rank();

create or replace function public.enforce_classic_team_rank()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trainer_owner uuid;
begin
  if new.team_slot is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.team_slot is not distinct from new.team_slot
      and old.owner_trainer_id is not distinct from new.owner_trainer_id then
      return new;
    end if;
  end if;

  select owner_id into v_trainer_owner
  from public.trainers
  where id = new.owner_trainer_id and game_id = new.game_id;

  if v_trainer_owner is not null
    and not public.classic_rank_allowed(new.game_id, v_trainer_owner, new.rank) then
    raise exception 'Este Pokemon deve permanecer no PC ate que o treinador obtenha mais insignias nesta regiao';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_classic_team_rank on public.pokemon;
create trigger enforce_classic_team_rank
  before insert or update of owner_trainer_id, team_slot on public.pokemon
  for each row execute function public.enforce_classic_team_rank();
