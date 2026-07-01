DROP POLICY IF EXISTS "owner or narrator inserts tokens" ON public.tokens;
CREATE POLICY "owner or narrator inserts tokens" ON public.tokens
FOR INSERT TO authenticated
WITH CHECK (public.can_edit_token(game_id, character_kind, character_id, owner_id));