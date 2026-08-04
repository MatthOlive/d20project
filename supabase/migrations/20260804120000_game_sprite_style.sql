alter table public.games
  add column if not exists sprite_style text not null default 'pixel';

alter table public.games
  drop constraint if exists games_sprite_style_check;

alter table public.games
  add constraint games_sprite_style_check
  check (sprite_style in ('pixel', '3d'));
