
-- 1) Fix map_backgrounds: add missing tile/crop columns
ALTER TABLE public.map_backgrounds
  ADD COLUMN IF NOT EXISTS crop_x numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crop_y numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crop_w numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS crop_h numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tile_group text,
  ADD COLUMN IF NOT EXISTS tile_col integer,
  ADD COLUMN IF NOT EXISTS tile_row integer;

-- 2) Decks
CREATE TABLE IF NOT EXISTS public.decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  name text NOT NULL,
  shuffled_order uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decks TO authenticated;
GRANT ALL ON public.decks TO service_role;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "decks members view" ON public.decks FOR SELECT TO authenticated
  USING (public.is_game_member(game_id, auth.uid()) OR public.is_game_narrator(game_id, auth.uid()));
CREATE POLICY "decks narrator manage" ON public.decks FOR ALL TO authenticated
  USING (public.is_game_narrator(game_id, auth.uid()))
  WITH CHECK (public.is_game_narrator(game_id, auth.uid()));
CREATE TRIGGER decks_set_updated_at BEFORE UPDATE ON public.decks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Cards
CREATE TABLE IF NOT EXISTS public.cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  front text NOT NULL,
  back text NOT NULL DEFAULT '',
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cards TO authenticated;
GRANT ALL ON public.cards TO service_role;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cards members view" ON public.cards FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND (public.is_game_member(d.game_id, auth.uid()) OR public.is_game_narrator(d.game_id, auth.uid()))));
CREATE POLICY "cards narrator manage" ON public.cards FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND public.is_game_narrator(d.game_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND public.is_game_narrator(d.game_id, auth.uid())));
CREATE TRIGGER cards_set_updated_at BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Card hands (per user)
CREATE TABLE IF NOT EXISTS public.card_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deck_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_hands TO authenticated;
GRANT ALL ON public.card_hands TO service_role;
ALTER TABLE public.card_hands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hands owner or narrator view" ON public.card_hands FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND public.is_game_narrator(d.game_id, auth.uid()))
  );
CREATE POLICY "hands owner manage" ON public.card_hands FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND (public.is_game_member(d.game_id, auth.uid()) OR public.is_game_narrator(d.game_id, auth.uid())))
  );
CREATE TRIGGER card_hands_set_updated_at BEFORE UPDATE ON public.card_hands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Discards
CREATE TABLE IF NOT EXISTS public.card_discards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_discards TO authenticated;
GRANT ALL ON public.card_discards TO service_role;
ALTER TABLE public.card_discards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discards members view" ON public.card_discards FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND (public.is_game_member(d.game_id, auth.uid()) OR public.is_game_narrator(d.game_id, auth.uid()))));
CREATE POLICY "discards members insert" ON public.card_discards FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND (public.is_game_member(d.game_id, auth.uid()) OR public.is_game_narrator(d.game_id, auth.uid()))));
CREATE POLICY "discards narrator delete" ON public.card_discards FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND public.is_game_narrator(d.game_id, auth.uid())));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.decks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.card_hands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.card_discards;
