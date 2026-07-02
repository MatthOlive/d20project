CREATE TABLE IF NOT EXISTS public.t20_powers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  cost text,
  prerequisite text,
  effect text NOT NULL DEFAULT '',
  source text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.t20_spells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  name text NOT NULL,
  circle text,
  school text,
  execution text,
  range_text text,
  target text,
  duration text,
  resistance text,
  cost text,
  effect text NOT NULL DEFAULT '',
  source text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.t20_character_powers (
  character_id uuid NOT NULL REFERENCES public.t20_characters(id) ON DELETE CASCADE,
  power_id uuid NOT NULL REFERENCES public.t20_powers(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, power_id)
);

CREATE TABLE IF NOT EXISTS public.t20_character_spells (
  character_id uuid NOT NULL REFERENCES public.t20_characters(id) ON DELETE CASCADE,
  spell_id uuid NOT NULL REFERENCES public.t20_spells(id) ON DELETE CASCADE,
  notes text,
  prepared boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, spell_id)
);

CREATE INDEX IF NOT EXISTS t20_powers_game_name_idx ON public.t20_powers(game_id, name);
CREATE INDEX IF NOT EXISTS t20_spells_game_name_idx ON public.t20_spells(game_id, name);
CREATE INDEX IF NOT EXISTS t20_character_powers_character_idx ON public.t20_character_powers(character_id);
CREATE INDEX IF NOT EXISTS t20_character_spells_character_idx ON public.t20_character_spells(character_id);

ALTER TABLE public.t20_powers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t20_spells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t20_character_powers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t20_character_spells ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members view t20 powers" ON public.t20_powers;
CREATE POLICY "members view t20 powers" ON public.t20_powers
  FOR SELECT TO authenticated
  USING (game_id IS NULL OR public.is_game_member(game_id, auth.uid()));

DROP POLICY IF EXISTS "members create t20 powers" ON public.t20_powers;
CREATE POLICY "members create t20 powers" ON public.t20_powers
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (game_id IS NULL OR public.is_game_member(game_id, auth.uid())));

DROP POLICY IF EXISTS "creator narrator update t20 powers" ON public.t20_powers;
CREATE POLICY "creator narrator update t20 powers" ON public.t20_powers
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR (game_id IS NOT NULL AND public.is_game_narrator(game_id, auth.uid())))
  WITH CHECK (created_by = auth.uid() OR (game_id IS NOT NULL AND public.is_game_narrator(game_id, auth.uid())));

DROP POLICY IF EXISTS "members view t20 spells" ON public.t20_spells;
CREATE POLICY "members view t20 spells" ON public.t20_spells
  FOR SELECT TO authenticated
  USING (game_id IS NULL OR public.is_game_member(game_id, auth.uid()));

DROP POLICY IF EXISTS "members create t20 spells" ON public.t20_spells;
CREATE POLICY "members create t20 spells" ON public.t20_spells
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (game_id IS NULL OR public.is_game_member(game_id, auth.uid())));

DROP POLICY IF EXISTS "creator narrator update t20 spells" ON public.t20_spells;
CREATE POLICY "creator narrator update t20 spells" ON public.t20_spells
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR (game_id IS NOT NULL AND public.is_game_narrator(game_id, auth.uid())))
  WITH CHECK (created_by = auth.uid() OR (game_id IS NOT NULL AND public.is_game_narrator(game_id, auth.uid())));

DROP POLICY IF EXISTS "members view t20 character powers" ON public.t20_character_powers;
CREATE POLICY "members view t20 character powers" ON public.t20_character_powers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.t20_characters c
      WHERE c.id = character_id
        AND public.can_view_character(c.game_id, 't20', c.id)
    )
  );

DROP POLICY IF EXISTS "edit t20 character powers" ON public.t20_character_powers;
CREATE POLICY "edit t20 character powers" ON public.t20_character_powers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.t20_characters c
      WHERE c.id = character_id
        AND (public.can_edit_character(c.game_id, c.owner_id) OR auth.uid() = ANY(c.allowed_editors))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.t20_characters c
      WHERE c.id = character_id
        AND (public.can_edit_character(c.game_id, c.owner_id) OR auth.uid() = ANY(c.allowed_editors))
    )
  );

DROP POLICY IF EXISTS "members view t20 character spells" ON public.t20_character_spells;
CREATE POLICY "members view t20 character spells" ON public.t20_character_spells
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.t20_characters c
      WHERE c.id = character_id
        AND public.can_view_character(c.game_id, 't20', c.id)
    )
  );

DROP POLICY IF EXISTS "edit t20 character spells" ON public.t20_character_spells;
CREATE POLICY "edit t20 character spells" ON public.t20_character_spells
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.t20_characters c
      WHERE c.id = character_id
        AND (public.can_edit_character(c.game_id, c.owner_id) OR auth.uid() = ANY(c.allowed_editors))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.t20_characters c
      WHERE c.id = character_id
        AND (public.can_edit_character(c.game_id, c.owner_id) OR auth.uid() = ANY(c.allowed_editors))
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.t20_powers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.t20_spells;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.t20_character_powers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.t20_character_spells;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
