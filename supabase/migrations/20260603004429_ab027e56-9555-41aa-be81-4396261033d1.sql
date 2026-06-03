
-- 1. Prevent players from escalating their role via self-update on game_members
DROP POLICY IF EXISTS "members update own membership" ON public.game_members;
CREATE POLICY "members update own membership"
ON public.game_members
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND role = (SELECT gm.role FROM public.game_members gm WHERE gm.game_id = game_members.game_id AND gm.user_id = auth.uid())
);

-- Allow narrators to update any membership (including role changes)
DROP POLICY IF EXISTS "narrator updates members" ON public.game_members;
CREATE POLICY "narrator updates members"
ON public.game_members
FOR UPDATE
TO authenticated
USING (public.is_game_narrator(game_id, auth.uid()))
WITH CHECK (public.is_game_narrator(game_id, auth.uid()));

-- 2. Revoke EXECUTE from anon on SECURITY DEFINER functions; only authenticated should call them
REVOKE EXECUTE ON FUNCTION public.can_edit_character(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_game_narrator(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_game_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_game_invite_code(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.join_game_by_invite(text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.can_edit_character(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_game_narrator(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_game_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_game_invite_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_game_by_invite(text) TO authenticated;

-- 3. Explicit deny policies on pokerole2 bucket writes (RLS already default-denies, but
-- make it explicit for the scanner and future-proofing). Only service_role can write.
CREATE POLICY "pokerole2 no client insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id <> 'pokerole2');

CREATE POLICY "pokerole2 no client update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id <> 'pokerole2');

CREATE POLICY "pokerole2 no client delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id <> 'pokerole2');
