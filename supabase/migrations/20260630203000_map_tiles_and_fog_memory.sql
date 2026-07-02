alter table public.map_backgrounds
  add column if not exists crop_x numeric not null default 0,
  add column if not exists crop_y numeric not null default 0,
  add column if not exists crop_w numeric not null default 1,
  add column if not exists crop_h numeric not null default 1,
  add column if not exists tile_group text,
  add column if not exists tile_col integer,
  add column if not exists tile_row integer;

alter table public.tokens
  add column if not exists style text not null default 'token',
  add column if not exists light_angle double precision not null default 360,
  add column if not exists light_direction double precision not null default 0,
  add column if not exists explored_mask jsonb not null default '[]'::jsonb;

alter table public.walls
  add column if not exists kind text not null default 'wall',
  add column if not exists is_open boolean not null default false,
  add column if not exists locked boolean not null default false,
  add column if not exists blocks_sight boolean not null default true,
  add column if not exists blocks_light boolean not null default true;
