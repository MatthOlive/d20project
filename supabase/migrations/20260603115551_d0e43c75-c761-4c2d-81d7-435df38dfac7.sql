-- 1) Restrict invite_code column visibility: only narrators access it via RPC
REVOKE SELECT ON public.games FROM authenticated;
GRANT SELECT (id, narrator_id, name, background_url, created_at, system, language, narrator_type, shiny_chance, overgrown_chance, contest_weights)
  ON public.games TO authenticated;
-- narrator still gets invite_code via SECURITY DEFINER get_game_invite_code()

-- 2) Ensure narrators are auto-added to game_members (function exists, trigger missing)
DROP TRIGGER IF EXISTS trg_add_narrator_as_member ON public.games;
CREATE TRIGGER trg_add_narrator_as_member
AFTER INSERT ON public.games
FOR EACH ROW EXECUTE FUNCTION public.add_narrator_as_member();

-- Backfill: insert narrators missing from game_members so Realtime works for them
INSERT INTO public.game_members (game_id, user_id, role)
SELECT g.id, g.narrator_id, 'narrator'
FROM public.games g
LEFT JOIN public.game_members gm
  ON gm.game_id = g.id AND gm.user_id = g.narrator_id
WHERE gm.user_id IS NULL
ON CONFLICT DO NOTHING;

-- 3) Helper SECURITY DEFINER functions are only used inside RLS policies.
-- Revoke direct EXECUTE from clients (policies run as table owner, so RLS still works).
REVOKE EXECUTE ON FUNCTION public.is_game_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_game_narrator(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_edit_character(uuid, uuid) FROM PUBLIC, anon, authenticated;