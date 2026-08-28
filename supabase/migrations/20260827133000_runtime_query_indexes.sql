-- Indexes for the hot paths used while a game is open.

create index if not exists tokens_game_page_idx
  on public.tokens(game_id, page_id);

create index if not exists initiative_game_position_idx
  on public.initiative(game_id, position, created_at);

create index if not exists scenarios_game_created_idx
  on public.scenarios(game_id, created_at);

create index if not exists pokemon_game_files_idx
  on public.pokemon(game_id, folder, created_at)
  where ai_spawned = false;

create index if not exists trainers_game_files_idx
  on public.trainers(game_id, folder, created_at);

create index if not exists game_engine_sessions_page_idx
  on public.game_engine_sessions(game_id, page_id, status);
