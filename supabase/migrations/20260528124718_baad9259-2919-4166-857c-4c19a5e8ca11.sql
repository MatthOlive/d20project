
ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS attr_points jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attr_bonus jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS social_attr_points jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS social_attr_bonus jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.pokemon
  ADD COLUMN IF NOT EXISTS attr_points jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attr_bonus jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS social_attr_points jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS social_attr_bonus jsonb NOT NULL DEFAULT '{}'::jsonb;
