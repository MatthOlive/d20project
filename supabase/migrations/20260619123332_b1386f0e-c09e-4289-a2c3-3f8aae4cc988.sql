CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.macros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#ef4444',
  visible_in_bar BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.macros TO authenticated;
GRANT ALL ON public.macros TO service_role;

ALTER TABLE public.macros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own macros" ON public.macros
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_macros_updated_at
  BEFORE UPDATE ON public.macros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_macros_user_game ON public.macros(user_id, game_id);