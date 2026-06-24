
-- Visibility default: only owner + narrator unless explicitly granted
DROP POLICY IF EXISTS "members view pokemon" ON public.pokemon;
CREATE POLICY "members view pokemon" ON public.pokemon FOR SELECT
USING (
  is_game_member(game_id, auth.uid()) AND (
    owner_id = auth.uid()
    OR is_game_narrator(game_id, auth.uid())
    OR auth.uid() = ANY (allowed_viewers)
    OR auth.uid() = ANY (allowed_editors)
  )
);

DROP POLICY IF EXISTS "members or narrator view trainers" ON public.trainers;
CREATE POLICY "members or narrator view trainers" ON public.trainers FOR SELECT
USING (
  (is_game_member(game_id, auth.uid()) OR is_game_narrator(game_id, auth.uid())) AND (
    owner_id = auth.uid()
    OR is_game_narrator(game_id, auth.uid())
    OR auth.uid() = ANY (allowed_viewers)
    OR auth.uid() = ANY (allowed_editors)
  )
);

CREATE OR REPLACE FUNCTION public.can_view_character(_game uuid, _kind text, _character uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _kind = 'pokemon' THEN EXISTS (
      SELECT 1 FROM public.pokemon p
      WHERE p.id = _character
        AND public.is_game_member(p.game_id, auth.uid())
        AND (
          p.owner_id = auth.uid()
          OR public.is_game_narrator(p.game_id, auth.uid())
          OR auth.uid() = ANY(p.allowed_viewers)
          OR auth.uid() = ANY(p.allowed_editors)
        )
    )
    WHEN _kind = 'trainer' THEN EXISTS (
      SELECT 1 FROM public.trainers t
      WHERE t.id = _character
        AND (public.is_game_member(t.game_id, auth.uid()) OR public.is_game_narrator(t.game_id, auth.uid()))
        AND (
          t.owner_id = auth.uid()
          OR public.is_game_narrator(t.game_id, auth.uid())
          OR auth.uid() = ANY(t.allowed_viewers)
          OR auth.uid() = ANY(t.allowed_editors)
        )
    )
    ELSE false
  END;
$$;
