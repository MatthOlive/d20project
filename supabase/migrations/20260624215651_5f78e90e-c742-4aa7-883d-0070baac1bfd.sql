
-- 1) Add nullable page_id columns
ALTER TABLE public.tokens          ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES public.scenarios(id) ON DELETE CASCADE;
ALTER TABLE public.map_drawings    ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES public.scenarios(id) ON DELETE CASCADE;
ALTER TABLE public.fog_regions     ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES public.scenarios(id) ON DELETE CASCADE;
ALTER TABLE public.walls           ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES public.scenarios(id) ON DELETE CASCADE;
ALTER TABLE public.map_backgrounds ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES public.scenarios(id) ON DELETE CASCADE;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS active_page_id uuid REFERENCES public.scenarios(id) ON DELETE SET NULL;

-- 2) Clean orphan rows (game_id no longer points to a games row)
DELETE FROM public.tokens          WHERE game_id NOT IN (SELECT id FROM public.games);
DELETE FROM public.map_drawings    WHERE game_id NOT IN (SELECT id FROM public.games);
DELETE FROM public.fog_regions     WHERE game_id NOT IN (SELECT id FROM public.games);
DELETE FROM public.walls           WHERE game_id NOT IN (SELECT id FROM public.games);
DELETE FROM public.map_backgrounds WHERE game_id NOT IN (SELECT id FROM public.games);

-- 3) Ensure every game has at least one scenario
INSERT INTO public.scenarios (game_id, name, background_url)
SELECT g.id, 'Página 1', g.background_url
FROM public.games g
WHERE NOT EXISTS (SELECT 1 FROM public.scenarios s WHERE s.game_id = g.id);

-- 4) Backfill page_id from the first scenario per game
WITH first_scn AS (
  SELECT DISTINCT ON (game_id) game_id, id
  FROM public.scenarios
  ORDER BY game_id, created_at ASC, id ASC
)
UPDATE public.tokens t          SET page_id = f.id FROM first_scn f WHERE t.game_id = f.game_id AND t.page_id IS NULL;
WITH first_scn AS (
  SELECT DISTINCT ON (game_id) game_id, id FROM public.scenarios ORDER BY game_id, created_at ASC, id ASC
)
UPDATE public.map_drawings t    SET page_id = f.id FROM first_scn f WHERE t.game_id = f.game_id AND t.page_id IS NULL;
WITH first_scn AS (
  SELECT DISTINCT ON (game_id) game_id, id FROM public.scenarios ORDER BY game_id, created_at ASC, id ASC
)
UPDATE public.fog_regions t     SET page_id = f.id FROM first_scn f WHERE t.game_id = f.game_id AND t.page_id IS NULL;
WITH first_scn AS (
  SELECT DISTINCT ON (game_id) game_id, id FROM public.scenarios ORDER BY game_id, created_at ASC, id ASC
)
UPDATE public.walls t           SET page_id = f.id FROM first_scn f WHERE t.game_id = f.game_id AND t.page_id IS NULL;
WITH first_scn AS (
  SELECT DISTINCT ON (game_id) game_id, id FROM public.scenarios ORDER BY game_id, created_at ASC, id ASC
)
UPDATE public.map_backgrounds t SET page_id = f.id FROM first_scn f WHERE t.game_id = f.game_id AND t.page_id IS NULL;
WITH first_scn AS (
  SELECT DISTINCT ON (game_id) game_id, id FROM public.scenarios ORDER BY game_id, created_at ASC, id ASC
)
UPDATE public.games g           SET active_page_id = f.id FROM first_scn f WHERE g.id = f.game_id AND g.active_page_id IS NULL;

-- 5) NOT NULL
ALTER TABLE public.tokens          ALTER COLUMN page_id SET NOT NULL;
ALTER TABLE public.map_drawings    ALTER COLUMN page_id SET NOT NULL;
ALTER TABLE public.fog_regions     ALTER COLUMN page_id SET NOT NULL;
ALTER TABLE public.walls           ALTER COLUMN page_id SET NOT NULL;
ALTER TABLE public.map_backgrounds ALTER COLUMN page_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS tokens_page_id_idx          ON public.tokens(page_id);
CREATE INDEX IF NOT EXISTS map_drawings_page_id_idx    ON public.map_drawings(page_id);
CREATE INDEX IF NOT EXISTS fog_regions_page_id_idx     ON public.fog_regions(page_id);
CREATE INDEX IF NOT EXISTS walls_page_id_idx           ON public.walls(page_id);
CREATE INDEX IF NOT EXISTS map_backgrounds_page_id_idx ON public.map_backgrounds(page_id);
