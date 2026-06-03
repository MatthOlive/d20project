-- Restore column-level SELECT on games for authenticated, excluding invite_code.
-- RLS still restricts which rows are visible (members or narrator only).
GRANT SELECT (
  id, narrator_id, name, background_url, created_at,
  narrator_type, language, shiny_chance, overgrown_chance,
  system, contest_weights
) ON public.games TO authenticated;