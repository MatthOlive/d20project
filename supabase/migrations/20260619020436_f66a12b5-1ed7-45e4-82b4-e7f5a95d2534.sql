
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS grid_enabled  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS grid_snap     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS grid_size     integer NOT NULL DEFAULT 56,
  ADD COLUMN IF NOT EXISTS grid_color    text    NOT NULL DEFAULT '#000000',
  ADD COLUMN IF NOT EXISTS grid_opacity  integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS grid_unit_m   numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS grid_unit_label text NOT NULL DEFAULT 'm';

ALTER TABLE public.tokens
  ADD COLUMN IF NOT EXISTS layer text NOT NULL DEFAULT 'tokens';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tokens_layer_check') THEN
    ALTER TABLE public.tokens
      ADD CONSTRAINT tokens_layer_check CHECK (layer IN ('tokens','gm'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.map_drawings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  scenario_id   uuid REFERENCES public.scenarios(id) ON DELETE CASCADE,
  layer         text NOT NULL DEFAULT 'drawing' CHECK (layer IN ('drawing','gm')),
  kind          text NOT NULL CHECK (kind IN ('freehand','rect','circle','line','text')),
  geometry      jsonb NOT NULL,
  stroke        text NOT NULL DEFAULT '#ef4444',
  fill          text,
  stroke_width  integer NOT NULL DEFAULT 3,
  text_content  text,
  author_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_drawings TO authenticated;
GRANT ALL ON public.map_drawings TO service_role;

ALTER TABLE public.map_drawings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "map_drawings_select_members" ON public.map_drawings;
CREATE POLICY "map_drawings_select_members" ON public.map_drawings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = map_drawings.game_id
        AND (
          g.narrator_id = auth.uid()
          OR (
            map_drawings.layer = 'drawing'
            AND EXISTS (
              SELECT 1 FROM public.game_members gm
              WHERE gm.game_id = g.id AND gm.user_id = auth.uid()
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "map_drawings_insert" ON public.map_drawings;
CREATE POLICY "map_drawings_insert" ON public.map_drawings
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = map_drawings.game_id
        AND (
          g.narrator_id = auth.uid()
          OR (
            map_drawings.layer = 'drawing'
            AND EXISTS (
              SELECT 1 FROM public.game_members gm
              WHERE gm.game_id = g.id AND gm.user_id = auth.uid()
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "map_drawings_delete" ON public.map_drawings;
CREATE POLICY "map_drawings_delete" ON public.map_drawings
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = map_drawings.game_id AND g.narrator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "map_drawings_update" ON public.map_drawings;
CREATE POLICY "map_drawings_update" ON public.map_drawings
  FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = map_drawings.game_id AND g.narrator_id = auth.uid()
    )
  );

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.map_drawings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
