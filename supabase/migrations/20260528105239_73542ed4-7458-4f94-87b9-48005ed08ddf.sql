
CREATE OR REPLACE FUNCTION public.join_game_by_invite(_code text)
RETURNS TABLE(game_id uuid, game_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _gid uuid;
  _gname text;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, name INTO _gid, _gname FROM public.games WHERE invite_code = _code;
  IF _gid IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  INSERT INTO public.game_members(game_id, user_id, role)
  VALUES (_gid, _uid, 'player')
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT _gid, _gname;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_game_by_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.join_game_by_invite(text) TO authenticated;
