
ALTER TABLE public.pokemon
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS nature text,
  ADD COLUMN IF NOT EXISTS held_item text,
  ADD COLUMN IF NOT EXISTS happiness integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS loyalty integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS battles integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS victories integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS social_attrs jsonb NOT NULL DEFAULT '{"tough":1,"cool":1,"beautiful":1,"cute":1,"clever":1}'::jsonb;

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS money integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS background text,
  ADD COLUMN IF NOT EXISTS social_attrs jsonb NOT NULL DEFAULT '{"tough":1,"cool":1,"beautiful":1,"cute":1,"clever":1}'::jsonb;
