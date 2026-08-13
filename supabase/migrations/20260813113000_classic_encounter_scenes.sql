-- Allow encounters in every scene currently available in Pokemon Classic mode.

alter table public.classic_encounters
  drop constraint if exists classic_encounters_scene_check;

alter table public.classic_encounters
  add constraint classic_encounters_scene_check
  check (scene in (
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
