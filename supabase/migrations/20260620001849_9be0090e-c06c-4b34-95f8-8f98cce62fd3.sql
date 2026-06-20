-- 1) biomes column on species
ALTER TABLE public.species ADD COLUMN IF NOT EXISTS biomes text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS species_biomes_gin_idx ON public.species USING GIN (biomes);

-- 2) routes table
CREATE TABLE IF NOT EXISTS public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  name text NOT NULL,
  species_ids uuid[] NOT NULL DEFAULT '{}',
  default_rank text NOT NULL DEFAULT 'starter',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT ALL ON public.routes TO service_role;

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view game routes"
  ON public.routes FOR SELECT TO authenticated
  USING (public.is_game_member(game_id, auth.uid()));

CREATE POLICY "narrator can insert routes"
  ON public.routes FOR INSERT TO authenticated
  WITH CHECK (public.is_game_narrator(game_id, auth.uid()));

CREATE POLICY "narrator can update routes"
  ON public.routes FOR UPDATE TO authenticated
  USING (public.is_game_narrator(game_id, auth.uid()))
  WITH CHECK (public.is_game_narrator(game_id, auth.uid()));

CREATE POLICY "narrator can delete routes"
  ON public.routes FOR DELETE TO authenticated
  USING (public.is_game_narrator(game_id, auth.uid()));

CREATE INDEX IF NOT EXISTS routes_game_idx ON public.routes(game_id);

CREATE TRIGGER routes_set_updated_at
  BEFORE UPDATE ON public.routes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();