-- Structured armor and shield selections for T20 characters. Existing manual
-- Defense values are preserved; the app recalculates only after a user changes
-- an equipment selection or explicitly applies the class baseline.
ALTER TABLE public.t20_characters
  ADD COLUMN IF NOT EXISTS armor_name text,
  ADD COLUMN IF NOT EXISTS shield_name text,
  ADD COLUMN IF NOT EXISTS equipment_rules_enabled boolean NOT NULL DEFAULT false;
