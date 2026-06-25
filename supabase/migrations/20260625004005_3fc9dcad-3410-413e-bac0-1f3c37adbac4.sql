ALTER TABLE public.walls
  ADD COLUMN IF NOT EXISTS blocks_sight boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS blocks_light boolean NOT NULL DEFAULT true;

ALTER TABLE public.tokens
  ADD COLUMN IF NOT EXISTS light_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS light_radius_bright real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS light_radius_dim real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS light_color text NOT NULL DEFAULT '#ffd27a',
  ADD COLUMN IF NOT EXISTS light_angle int NOT NULL DEFAULT 360,
  ADD COLUMN IF NOT EXISTS vision_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vision_range real NOT NULL DEFAULT 0;

ALTER TABLE public.scenarios
  ADD COLUMN IF NOT EXISTS darkness_level real NOT NULL DEFAULT 0;