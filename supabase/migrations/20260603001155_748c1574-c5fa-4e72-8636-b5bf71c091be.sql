ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS contest_rank text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notoriety jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trainings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retrains integer NOT NULL DEFAULT 0;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS contest_weights jsonb;