
-- ===== ENUMS =====
create type public.game_role as enum ('narrator', 'player');
create type public.pokerole_rank as enum ('starter','beginner','amateur','ace','pro','master');
create type public.pokemon_type as enum (
  'normal','fire','water','electric','grass','ice','fighting','poison','ground',
  'flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'
);
create type public.attr_key as enum (
  'strength','dexterity','vitality','insight','toughness','appeal','control',
  'hp','will','defense','special_defense'
);

-- ===== PROFILES =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);
create policy "users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);
create policy "users insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Trainer'))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== GAMES =====
create table public.games (
  id uuid primary key default gen_random_uuid(),
  narrator_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  background_url text,
  invite_code text not null unique default encode(gen_random_bytes(8), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.games enable row level security;

create table public.game_members (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.game_role not null default 'player',
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
alter table public.game_members enable row level security;

-- Membership helper (security definer to avoid RLS recursion)
create or replace function public.is_game_member(_game uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.game_members where game_id = _game and user_id = _user);
$$;
create or replace function public.is_game_narrator(_game uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.games where id = _game and narrator_id = _user);
$$;

create policy "members can view game"
  on public.games for select to authenticated
  using (public.is_game_member(id, auth.uid()) or narrator_id = auth.uid());
create policy "anyone authed can create games"
  on public.games for insert to authenticated with check (narrator_id = auth.uid());
create policy "narrator updates game"
  on public.games for update to authenticated using (narrator_id = auth.uid());
create policy "narrator deletes game"
  on public.games for delete to authenticated using (narrator_id = auth.uid());

create policy "members view membership"
  on public.game_members for select to authenticated
  using (public.is_game_member(game_id, auth.uid()) or public.is_game_narrator(game_id, auth.uid()));
create policy "users can join games"
  on public.game_members for insert to authenticated
  with check (user_id = auth.uid() or public.is_game_narrator(game_id, auth.uid()));
create policy "narrator manages members"
  on public.game_members for delete to authenticated
  using (public.is_game_narrator(game_id, auth.uid()) or user_id = auth.uid());

-- Auto-add narrator as member
create or replace function public.add_narrator_as_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.game_members (game_id, user_id, role)
  values (new.id, new.narrator_id, 'narrator')
  on conflict do nothing;
  return new;
end;
$$;
create trigger on_game_created
  after insert on public.games
  for each row execute function public.add_narrator_as_member();

-- ===== REFERENCE DATA: abilities, moves, species =====
create table public.abilities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  effect text not null default ''
);
alter table public.abilities enable row level security;
create policy "abilities readable" on public.abilities for select to authenticated using (true);

create table public.moves (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type public.pokemon_type not null,
  power int not null default 0,
  accuracy_stat public.attr_key,
  accuracy_skill text,
  damage_stat public.attr_key,
  effect text not null default '',
  target text not null default 'foe',
  category text not null default 'physical' -- physical | special | status
);
alter table public.moves enable row level security;
create policy "moves readable" on public.moves for select to authenticated using (true);

create table public.species (
  id uuid primary key default gen_random_uuid(),
  dex_number int,
  name text not null unique,
  types public.pokemon_type[] not null default '{}',
  base_hp int not null default 0,
  base_attrs jsonb not null default '{}'::jsonb,    -- {strength:1, dexterity:1, ...}
  attr_limits jsonb not null default '{}'::jsonb,   -- species attribute maximums
  abilities text[] not null default '{}',
  hidden_ability text,
  suggested_rank public.pokerole_rank,
  sprite_url text
);
alter table public.species enable row level security;
create policy "species readable" on public.species for select to authenticated using (true);

create table public.species_moves (
  species_id uuid not null references public.species(id) on delete cascade,
  move_id uuid not null references public.moves(id) on delete cascade,
  min_rank public.pokerole_rank not null default 'starter',
  primary key (species_id, move_id)
);
alter table public.species_moves enable row level security;
create policy "species_moves readable" on public.species_moves for select to authenticated using (true);

-- ===== CHARACTERS: trainers and pokemon =====
create table public.trainers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'New Trainer',
  nature text,
  age int,
  concept text,
  confidence int not null default 0,
  rank public.pokerole_rank not null default 'starter',
  attrs jsonb not null default '{"strength":1,"dexterity":1,"vitality":1,"insight":1,"toughness":1,"appeal":1,"control":1}'::jsonb,
  skills jsonb not null default '{}'::jsonb,
  pokedex jsonb not null default '{}'::jsonb, -- {dex_num: {seen:bool, caught:bool}}
  notes text not null default '',
  created_at timestamptz not null default now()
);
alter table public.trainers enable row level security;

create table public.pokemon (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  species_id uuid not null references public.species(id),
  nickname text,
  rank public.pokerole_rank not null default 'starter',
  current_attrs jsonb not null default '{}'::jsonb,
  modifiers jsonb not null default '{}'::jsonb,
  hp int not null default 0,
  will int not null default 0,
  status text[] not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now()
);
alter table public.pokemon enable row level security;

create table public.trainer_moves (
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  move_id uuid not null references public.moves(id) on delete cascade,
  primary key (trainer_id, move_id)
);
alter table public.trainer_moves enable row level security;

create table public.pokemon_moves (
  pokemon_id uuid not null references public.pokemon(id) on delete cascade,
  move_id uuid not null references public.moves(id) on delete cascade,
  primary key (pokemon_id, move_id)
);
alter table public.pokemon_moves enable row level security;

-- Owner-or-narrator policy helper
create or replace function public.can_edit_character(_game uuid, _owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _owner = auth.uid() or public.is_game_narrator(_game, auth.uid());
$$;

-- Trainers RLS
create policy "members view trainers" on public.trainers for select to authenticated
  using (public.is_game_member(game_id, auth.uid()));
create policy "owner inserts trainer" on public.trainers for insert to authenticated
  with check (owner_id = auth.uid() and public.is_game_member(game_id, auth.uid()));
create policy "owner or narrator edits trainer" on public.trainers for update to authenticated
  using (public.can_edit_character(game_id, owner_id));
create policy "owner or narrator deletes trainer" on public.trainers for delete to authenticated
  using (public.can_edit_character(game_id, owner_id));

-- Pokemon RLS
create policy "members view pokemon" on public.pokemon for select to authenticated
  using (public.is_game_member(game_id, auth.uid()));
create policy "owner inserts pokemon" on public.pokemon for insert to authenticated
  with check (owner_id = auth.uid() and public.is_game_member(game_id, auth.uid()));
create policy "owner or narrator edits pokemon" on public.pokemon for update to authenticated
  using (public.can_edit_character(game_id, owner_id));
create policy "owner or narrator deletes pokemon" on public.pokemon for delete to authenticated
  using (public.can_edit_character(game_id, owner_id));

-- Move-link RLS (mirror parent)
create policy "view trainer_moves" on public.trainer_moves for select to authenticated
  using (exists (select 1 from public.trainers t where t.id = trainer_id and public.is_game_member(t.game_id, auth.uid())));
create policy "edit trainer_moves" on public.trainer_moves for all to authenticated
  using (exists (select 1 from public.trainers t where t.id = trainer_id and public.can_edit_character(t.game_id, t.owner_id)))
  with check (exists (select 1 from public.trainers t where t.id = trainer_id and public.can_edit_character(t.game_id, t.owner_id)));

create policy "view pokemon_moves" on public.pokemon_moves for select to authenticated
  using (exists (select 1 from public.pokemon p where p.id = pokemon_id and public.is_game_member(p.game_id, auth.uid())));
create policy "edit pokemon_moves" on public.pokemon_moves for all to authenticated
  using (exists (select 1 from public.pokemon p where p.id = pokemon_id and public.can_edit_character(p.game_id, p.owner_id)))
  with check (exists (select 1 from public.pokemon p where p.id = pokemon_id and public.can_edit_character(p.game_id, p.owner_id)));

-- ===== MOVE CAP TRIGGER (Insight + 2) =====
create or replace function public.enforce_pokemon_move_cap()
returns trigger language plpgsql as $$
declare
  insight int;
  current_count int;
begin
  select coalesce((current_attrs->>'insight')::int, 1) into insight from public.pokemon where id = new.pokemon_id;
  select count(*) into current_count from public.pokemon_moves where pokemon_id = new.pokemon_id;
  if current_count >= insight + 2 then
    raise exception 'This Pokémon has reached the maximum number of moves.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger pokemon_move_cap before insert on public.pokemon_moves
  for each row execute function public.enforce_pokemon_move_cap();

create or replace function public.enforce_trainer_move_cap()
returns trigger language plpgsql as $$
declare
  insight int;
  current_count int;
begin
  select coalesce((attrs->>'insight')::int, 1) into insight from public.trainers where id = new.trainer_id;
  select count(*) into current_count from public.trainer_moves where trainer_id = new.trainer_id;
  if current_count >= insight + 2 then
    raise exception 'This Trainer has reached the maximum number of moves.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trainer_move_cap before insert on public.trainer_moves
  for each row execute function public.enforce_trainer_move_cap();

-- ===== CHAT =====
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'chat', -- chat | roll | system
  body text not null default '',
  roll_data jsonb,
  created_at timestamptz not null default now()
);
alter table public.chat_messages enable row level security;
create policy "members view chat" on public.chat_messages for select to authenticated
  using (public.is_game_member(game_id, auth.uid()));
create policy "members post chat" on public.chat_messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_game_member(game_id, auth.uid()));

-- ===== INITIATIVE =====
create table public.initiative (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  character_name text not null,
  character_kind text not null default 'pokemon', -- pokemon | trainer | npc
  character_ref uuid,
  successes int not null default 0,
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.initiative enable row level security;
create policy "members view initiative" on public.initiative for select to authenticated
  using (public.is_game_member(game_id, auth.uid()));
create policy "narrator manages initiative" on public.initiative for all to authenticated
  using (public.is_game_narrator(game_id, auth.uid()))
  with check (public.is_game_narrator(game_id, auth.uid()));

-- ===== REALTIME =====
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.initiative;
alter publication supabase_realtime add table public.pokemon;
alter publication supabase_realtime add table public.trainers;
alter publication supabase_realtime add table public.games;

-- ===== INDEXES =====
create index on public.game_members (user_id);
create index on public.chat_messages (game_id, created_at desc);
create index on public.species_moves (species_id);
create index on public.species_moves (move_id);
create index on public.pokemon (game_id);
create index on public.trainers (game_id);
