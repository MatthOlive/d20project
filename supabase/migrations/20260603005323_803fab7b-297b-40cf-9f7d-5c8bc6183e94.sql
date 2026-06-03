ALTER TABLE public.pokemon
  ADD COLUMN IF NOT EXISTS trainings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retrains integer NOT NULL DEFAULT 0;