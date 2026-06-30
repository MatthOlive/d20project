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

DROP POLICY IF EXISTS "owner or narrator inserts tokens" ON public.tokens;
CREATE POLICY "owner or narrator inserts tokens" ON public.tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_game_member(game_id, auth.uid())
    AND public.can_edit_token(game_id, character_kind, character_id, owner_id)
    AND EXISTS (
      SELECT 1 FROM public.scenarios s
      WHERE s.id = page_id AND s.game_id = tokens.game_id
    )
  );
