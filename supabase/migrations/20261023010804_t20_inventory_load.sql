-- Structured inventory is additive: legacy free-text inventory is preserved
-- and intentionally not guessed into quantities or item spaces.
ALTER TABLE public.t20_characters
  ADD COLUMN IF NOT EXISTS inventory_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS coins_total integer NOT NULL DEFAULT 0 CHECK (coins_total >= 0),
  ADD COLUMN IF NOT EXISTS adventure_backpack boolean NOT NULL DEFAULT false;
