
-- 1) Trainers SELECT: include narrator access
DROP POLICY IF EXISTS "members view trainers" ON public.trainers;
CREATE POLICY "members or narrator view trainers"
ON public.trainers
FOR SELECT
TO authenticated
USING (is_game_member(game_id, auth.uid()) OR is_game_narrator(game_id, auth.uid()));

-- 2) Realtime authorization: restrict subscriptions to game members
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game members can read realtime" ON realtime.messages;
CREATE POLICY "game members can read realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (split_part(realtime.topic(), ':', 1) IN ('tokens','chat','initiative','game','pokemon','trainers'))
  AND public.is_game_member(
    NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid,
    auth.uid()
  )
);

DROP POLICY IF EXISTS "game members can broadcast realtime" ON realtime.messages;
CREATE POLICY "game members can broadcast realtime"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (split_part(realtime.topic(), ':', 1) IN ('tokens','chat','initiative','game','pokemon','trainers'))
  AND public.is_game_member(
    NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid,
    auth.uid()
  )
);

-- 3) Hide invite_code from non-narrators via column-level permissions.
--    Revoke broad column SELECT, then grant the column only to narrator-accessible reads.
--    Since column-level RLS isn't supported directly, we revoke the column from `authenticated`
--    and provide a SECURITY DEFINER helper for narrators.
REVOKE SELECT (invite_code) ON public.games FROM authenticated;
REVOKE SELECT (invite_code) ON public.games FROM anon;

CREATE OR REPLACE FUNCTION public.get_game_invite_code(_game uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT invite_code FROM public.games
   WHERE id = _game AND narrator_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_game_invite_code(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_game_invite_code(uuid) TO authenticated;
