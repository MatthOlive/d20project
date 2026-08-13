-- Pokemon Classic mode: Viridian City and neighboring routes.

alter table public.classic_player_progress
  drop constraint if exists classic_player_progress_world_scene_check;

alter table public.classic_player_progress
  add constraint classic_player_progress_world_scene_check
  check (world_scene in (
    'bedroom',
    'player_house_1f',
    'rival_house_1f',
    'rival_bedroom',
    'pallet',
    'lab',
    'route_1',
    'viridian',
    'route_2',
    'route_22'
  ));
