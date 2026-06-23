
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
      ELSE false
    END;
$$;

DROP POLICY IF EXISTS "members view tokens" ON public.tokens;
CREATE POLICY "members view tokens" ON public.tokens
  FOR SELECT TO authenticated
  USING (
    public.is_game_member(game_id, auth.uid())
    AND public.can_view_character(game_id, character_kind, character_id)
  );

DROP POLICY IF EXISTS "owner or narrator updates tokens" ON public.tokens;
CREATE POLICY "owner or narrator updates tokens" ON public.tokens
  FOR UPDATE TO authenticated
  USING (public.can_edit_token(game_id, character_kind, character_id, owner_id));

DROP POLICY IF EXISTS "owner or narrator deletes tokens" ON public.tokens;
CREATE POLICY "owner or narrator deletes tokens" ON public.tokens
  FOR DELETE TO authenticated
  USING (public.can_edit_token(game_id, character_kind, character_id, owner_id));
