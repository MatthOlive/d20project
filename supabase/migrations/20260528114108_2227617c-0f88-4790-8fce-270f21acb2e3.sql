ALTER TABLE public.game_members ADD COLUMN IF NOT EXISTS display_name text;

CREATE POLICY "members update own membership"
ON public.game_members
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());