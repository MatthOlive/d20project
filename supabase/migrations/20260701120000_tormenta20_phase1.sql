ALTER TABLE public.games ADD COLUMN IF NOT EXISTS system text NOT NULL DEFAULT 'pokerole';

CREATE TABLE IF NOT EXISTS public.t20_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Novo personagem',
  image_url text,
  race text,
  class_name text,
  origin text,
  deity text,
  level integer NOT NULL DEFAULT 1,
  xp integer NOT NULL DEFAULT 0,
  attributes jsonb NOT NULL DEFAULT '{"forca":0,"destreza":0,"constituicao":0,"inteligencia":0,"sabedoria":0,"carisma":0}'::jsonb,
  skills jsonb NOT NULL DEFAULT '{}'::jsonb,
  hp_current integer NOT NULL DEFAULT 10,
  hp_max integer NOT NULL DEFAULT 10,
  mp_current integer NOT NULL DEFAULT 0,
  mp_max integer NOT NULL DEFAULT 0,
  defense integer NOT NULL DEFAULT 10,
  speed integer NOT NULL DEFAULT 9,
  attacks text,
  powers text,
  spells text,
  inventory text,
  notes text,
  folder text,
  allowed_viewers uuid[] NOT NULL DEFAULT '{}',
  allowed_editors uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS t20_characters_game_idx ON public.t20_characters(game_id);
CREATE INDEX IF NOT EXISTS t20_characters_owner_idx ON public.t20_characters(owner_id);

ALTER TABLE public.t20_characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members view t20 characters" ON public.t20_characters;
CREATE POLICY "members view t20 characters" ON public.t20_characters
  FOR SELECT TO authenticated
  USING (
    public.is_game_member(game_id, auth.uid())
    AND (
      cardinality(allowed_viewers) = 0
      OR owner_id = auth.uid()
      OR public.is_game_narrator(game_id, auth.uid())
      OR auth.uid() = ANY(allowed_viewers)
    )
  );

DROP POLICY IF EXISTS "owner inserts t20 characters" ON public.t20_characters;
CREATE POLICY "owner inserts t20 characters" ON public.t20_characters
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND public.is_game_member(game_id, auth.uid())
  );

DROP POLICY IF EXISTS "owner narrator editors update t20 characters" ON public.t20_characters;
CREATE POLICY "owner narrator editors update t20 characters" ON public.t20_characters
  FOR UPDATE TO authenticated
  USING (
    public.can_edit_character(game_id, owner_id)
    OR auth.uid() = ANY(allowed_editors)
  )
  WITH CHECK (
    public.can_edit_character(game_id, owner_id)
    OR auth.uid() = ANY(allowed_editors)
  );

DROP POLICY IF EXISTS "owner narrator editors delete t20 characters" ON public.t20_characters;
CREATE POLICY "owner narrator editors delete t20 characters" ON public.t20_characters
  FOR DELETE TO authenticated
  USING (
    public.can_edit_character(game_id, owner_id)
    OR auth.uid() = ANY(allowed_editors)
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tokens'::regclass
      AND conname = 'tokens_character_kind_check'
  ) THEN
    ALTER TABLE public.tokens DROP CONSTRAINT tokens_character_kind_check;
  END IF;
END $$;

ALTER TABLE public.tokens
  ADD CONSTRAINT tokens_character_kind_check
  CHECK (character_kind IN ('pokemon','trainer','t20'));

CREATE OR REPLACE FUNCTION public.can_view_character(_game uuid, _kind text, _character uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _kind = 'pokemon' THEN EXISTS (
      SELECT 1 FROM public.pokemon p
      WHERE p.id = _character
        AND public.is_game_member(p.game_id, auth.uid())
        AND (
          cardinality(p.allowed_viewers) = 0
          OR p.owner_id = auth.uid()
          OR public.is_game_narrator(p.game_id, auth.uid())
          OR auth.uid() = ANY(p.allowed_viewers)
        )
    )
    WHEN _kind = 'trainer' THEN EXISTS (
      SELECT 1 FROM public.trainers t
      WHERE t.id = _character
        AND (public.is_game_member(t.game_id, auth.uid()) OR public.is_game_narrator(t.game_id, auth.uid()))
        AND (
          cardinality(t.allowed_viewers) = 0
          OR t.owner_id = auth.uid()
          OR public.is_game_narrator(t.game_id, auth.uid())
          OR auth.uid() = ANY(t.allowed_viewers)
        )
    )
    WHEN _kind = 't20' THEN EXISTS (
      SELECT 1 FROM public.t20_characters c
      WHERE c.id = _character
        AND public.is_game_member(c.game_id, auth.uid())
        AND (
          cardinality(c.allowed_viewers) = 0
          OR c.owner_id = auth.uid()
          OR public.is_game_narrator(c.game_id, auth.uid())
          OR auth.uid() = ANY(c.allowed_viewers)
        )
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_token(_game uuid, _kind text, _character uuid, _token_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_edit_character(_game, _token_owner)
    OR CASE
      WHEN _kind = 'pokemon' THEN EXISTS (
        SELECT 1 FROM public.pokemon p
        WHERE p.id = _character AND auth.uid() = ANY(p.allowed_editors)
      )
      WHEN _kind = 'trainer' THEN EXISTS (
        SELECT 1 FROM public.trainers t
        WHERE t.id = _character AND auth.uid() = ANY(t.allowed_editors)
      )
      WHEN _kind = 't20' THEN EXISTS (
        SELECT 1 FROM public.t20_characters c
        WHERE c.id = _character AND auth.uid() = ANY(c.allowed_editors)
      )
      ELSE false
    END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.t20_characters;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.t20_characters REPLICA IDENTITY FULL;
