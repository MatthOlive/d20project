
-- Trainer: current will, structured inventory, achievements
ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS current_will integer,
  ADD COLUMN IF NOT EXISTS bag_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS battle_items_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS potions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS achievements jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Pokemon: current will too (max = insight+2 for pokemon as well)
ALTER TABLE public.pokemon
  ADD COLUMN IF NOT EXISTS current_will integer;

-- Scenarios (narrator-managed map presets per game)
CREATE TABLE IF NOT EXISTS public.scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'New Scenario',
  background_url text,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view scenarios"
  ON public.scenarios FOR SELECT TO authenticated
  USING (public.is_game_member(game_id, auth.uid()));

CREATE POLICY "narrator manages scenarios"
  ON public.scenarios FOR ALL TO authenticated
  USING (public.is_game_narrator(game_id, auth.uid()))
  WITH CHECK (public.is_game_narrator(game_id, auth.uid()));
