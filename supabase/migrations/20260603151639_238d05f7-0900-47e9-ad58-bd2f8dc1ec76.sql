GRANT EXECUTE ON FUNCTION public.is_game_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_game_narrator(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_character(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_game_invite_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_game_by_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge(vector, integer) TO authenticated;