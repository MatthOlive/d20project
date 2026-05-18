
ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS current_hp integer,
  ADD COLUMN IF NOT EXISTS status_conditions text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.pokemon
  ADD COLUMN IF NOT EXISTS current_hp integer;
