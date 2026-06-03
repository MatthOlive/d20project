GRANT SELECT (
  id,
  narrator_id,
  name,
  background_url,
  created_at,
  narrator_type,
  language,
  shiny_chance,
  overgrown_chance,
  system,
  contest_weights
) ON public.games TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;