alter table public.map_backgrounds
  add column if not exists crop_x numeric not null default 0,
  add column if not exists crop_y numeric not null default 0,
  add column if not exists crop_w numeric not null default 1,
  add column if not exists crop_h numeric not null default 1,
  add column if not exists tile_group text,
  add column if not exists tile_col integer,
  add column if not exists tile_row integer;

alter table public.tokens
  add column if not exists explored_mask jsonb;
