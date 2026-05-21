
alter table public.games add column if not exists language text not null default 'pt-BR';
alter table public.profiles add column if not exists theme text not null default 'dark';
alter table public.pokemon add column if not exists ai_spawned boolean not null default false;
alter table public.pokemon add column if not exists ai_scene_id text;
alter table public.trainers add column if not exists ai_spawned boolean not null default false;
alter table public.trainers add column if not exists ai_scene_id text;
create index if not exists idx_pokemon_ai_scene on public.pokemon(game_id, ai_scene_id) where ai_spawned = true;
create index if not exists idx_trainers_ai_scene on public.trainers(game_id, ai_scene_id) where ai_spawned = true;
