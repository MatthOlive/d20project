
CREATE TABLE IF NOT EXISTS public.fog_regions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  x           real NOT NULL,
  y           real NOT NULL,
  w           real NOT NULL,
  h           real NOT NULL,
  revealed    boolean NOT NULL DEFAULT true,
  author_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fog_regions TO authenticated;
GRANT ALL ON public.fog_regions TO service_role;
ALTER TABLE public.fog_regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fog_regions_select_members" ON public.fog_regions;
CREATE POLICY "fog_regions_select_members" ON public.fog_regions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id = fog_regions.game_id AND (
      g.narrator_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.game_members gm WHERE gm.game_id = g.id AND gm.user_id = auth.uid())
    )
  ));

DROP POLICY IF EXISTS "fog_regions_write_narrator" ON public.fog_regions;
CREATE POLICY "fog_regions_write_narrator" ON public.fog_regions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.games g WHERE g.id = fog_regions.game_id AND g.narrator_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.games g WHERE g.id = fog_regions.game_id AND g.narrator_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.walls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  x1          real NOT NULL,
  y1          real NOT NULL,
  x2          real NOT NULL,
  y2          real NOT NULL,
  author_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.walls TO authenticated;
GRANT ALL ON public.walls TO service_role;
ALTER TABLE public.walls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "walls_select_members" ON public.walls;
CREATE POLICY "walls_select_members" ON public.walls
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id = walls.game_id AND (
      g.narrator_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.game_members gm WHERE gm.game_id = g.id AND gm.user_id = auth.uid())
    )
  ));

DROP POLICY IF EXISTS "walls_write_narrator" ON public.walls;
CREATE POLICY "walls_write_narrator" ON public.walls
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.games g WHERE g.id = walls.game_id AND g.narrator_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.games g WHERE g.id = walls.game_id AND g.narrator_id = auth.uid()));

ALTER TABLE public.tokens
  ADD COLUMN IF NOT EXISTS vision_radius real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS light_radius  real NOT NULL DEFAULT 0;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS fog_enabled            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dynamic_lighting       boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fog_regions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.walls;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
