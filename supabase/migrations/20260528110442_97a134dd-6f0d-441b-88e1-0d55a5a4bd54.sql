DROP POLICY IF EXISTS "users can join games" ON public.game_members;

CREATE POLICY "narrator adds members"
ON public.game_members
FOR INSERT
TO authenticated
WITH CHECK (public.is_game_narrator(game_id, auth.uid()));
