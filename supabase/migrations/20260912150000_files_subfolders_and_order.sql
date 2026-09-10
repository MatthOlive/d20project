-- Persist folder hierarchy paths and the order of fichas inside each folder.
alter table public.digirole_tamers
  add column if not exists file_order integer not null default 0;
alter table public.digirole_digimons
  add column if not exists file_order integer not null default 0;

create index if not exists digirole_tamers_files_order_idx
  on public.digirole_tamers(game_id, folder, file_order, created_at);
create index if not exists digirole_digimons_files_order_idx
  on public.digirole_digimons(game_id, folder, file_order, created_at);
