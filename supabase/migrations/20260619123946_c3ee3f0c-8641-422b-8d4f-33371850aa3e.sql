CREATE TABLE public.map_backgrounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  x DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  y DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  width DOUBLE PRECISION NOT NULL DEFAULT 0.4,
  height DOUBLE PRECISION NOT NULL DEFAULT 0.4,
  rotation DOUBLE PRECISION NOT NULL DEFAULT 0,
  z_index INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_backgrounds TO authenticated;
GRANT ALL ON public.map_backgrounds TO service_role;

ALTER TABLE public.map_backgrounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Game members view backgrounds" ON public.map_backgrounds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_members gm
      WHERE gm.game_id = map_backgrounds.game_id
        AND gm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = map_backgrounds.game_id
        AND g.narrator_id = auth.uid()
    )
  );

CREATE POLICY "Narrator manages backgrounds" ON public.map_backgrounds
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = map_backgrounds.game_id
        AND g.narrator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = map_backgrounds.game_id
        AND g.narrator_id = auth.uid()
    )
  );

CREATE TRIGGER trg_map_backgrounds_updated_at
  BEFORE UPDATE ON public.map_backgrounds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_map_backgrounds_game ON public.map_backgrounds(game_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.map_backgrounds;