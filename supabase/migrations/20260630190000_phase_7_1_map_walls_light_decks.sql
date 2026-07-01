ALTER TABLE public.walls
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'wall',
  ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'walls_kind_check') THEN
    ALTER TABLE public.walls
      ADD CONSTRAINT walls_kind_check CHECK (kind IN ('wall','door','window'));
  END IF;
END $$;

ALTER TABLE public.tokens
  ADD COLUMN IF NOT EXISTS style text NOT NULL DEFAULT 'token',
  ADD COLUMN IF NOT EXISTS light_direction double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS explored_mask jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tokens_style_check') THEN
    ALTER TABLE public.tokens
      ADD CONSTRAINT tokens_style_check CHECK (style IN ('token','handout'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  name text NOT NULL,
  shuffled_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  front text NOT NULL DEFAULT '',
  back text NOT NULL DEFAULT '',
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.card_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(deck_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.card_discards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  discarded_by uuid NOT NULL DEFAULT auth.uid(),
  public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_hands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_discards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members view decks" ON public.decks;
CREATE POLICY "members view decks" ON public.decks FOR SELECT TO authenticated
USING (public.is_game_member(game_id, auth.uid()));

DROP POLICY IF EXISTS "narrator manages decks" ON public.decks;
CREATE POLICY "narrator manages decks" ON public.decks FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.games g WHERE g.id = decks.game_id AND g.narrator_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.games g WHERE g.id = decks.game_id AND g.narrator_id = auth.uid()));

DROP POLICY IF EXISTS "members view cards" ON public.cards;
CREATE POLICY "members view cards" ON public.cards FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.decks d
  WHERE d.id = cards.deck_id AND public.is_game_member(d.game_id, auth.uid())
));

DROP POLICY IF EXISTS "narrator manages cards" ON public.cards;
CREATE POLICY "narrator manages cards" ON public.cards FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.decks d
  JOIN public.games g ON g.id = d.game_id
  WHERE d.id = cards.deck_id AND g.narrator_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.decks d
  JOIN public.games g ON g.id = d.game_id
  WHERE d.id = cards.deck_id AND g.narrator_id = auth.uid()
));

DROP POLICY IF EXISTS "owner or narrator views hands" ON public.card_hands;
CREATE POLICY "owner or narrator views hands" ON public.card_hands FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.decks d
    JOIN public.games g ON g.id = d.game_id
    WHERE d.id = card_hands.deck_id AND g.narrator_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "owner or narrator manages hands" ON public.card_hands;
CREATE POLICY "owner or narrator manages hands" ON public.card_hands FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.decks d
    JOIN public.games g ON g.id = d.game_id
    WHERE d.id = card_hands.deck_id AND g.narrator_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.decks d
    JOIN public.games g ON g.id = d.game_id
    WHERE d.id = card_hands.deck_id AND g.narrator_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "members view discards" ON public.card_discards;
CREATE POLICY "members view discards" ON public.card_discards FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.decks d
  WHERE d.id = card_discards.deck_id AND public.is_game_member(d.game_id, auth.uid())
));

DROP POLICY IF EXISTS "members create discards" ON public.card_discards;
CREATE POLICY "members create discards" ON public.card_discards FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.decks d
  WHERE d.id = card_discards.deck_id AND public.is_game_member(d.game_id, auth.uid())
));
