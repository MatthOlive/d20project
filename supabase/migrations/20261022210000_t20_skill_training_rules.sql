-- Additive T20 skill-rule support. Existing sheets remain in manual-bonus mode
-- until their owner explicitly enables the Corebook formula. Class and origin
-- training are stored separately so changing one never erases the other.
ALTER TABLE public.t20_characters
  ADD COLUMN IF NOT EXISTS skill_rules_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trained_skills jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS class_trained_skills jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS origin_trained_skills jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS armor_penalty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS derived_stats_initialized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weapons jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Do not treat legacy sheets as newly created characters. Their current PV/PM
-- and Defense may contain manual or in-play values and must never be refilled.
UPDATE public.t20_characters
SET derived_stats_initialized = true
WHERE derived_stats_initialized = false;

-- New characters start with rule-derived skill checks. Legacy characters keep
-- their saved numeric bonuses and can opt in from the sheet when ready.
