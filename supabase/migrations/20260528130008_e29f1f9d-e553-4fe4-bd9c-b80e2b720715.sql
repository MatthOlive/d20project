-- Music tracks queue per game
CREATE TABLE public.music_tracks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  thumbnail TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  added_by UUID NOT NULL,
  is_playing BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.music_tracks TO authenticated;
GRANT ALL ON public.music_tracks TO service_role;

ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view music"
  ON public.music_tracks FOR SELECT TO authenticated
  USING (public.is_game_member(game_id, auth.uid()));

CREATE POLICY "members add music"
  ON public.music_tracks FOR INSERT TO authenticated
  WITH CHECK (added_by = auth.uid() AND public.is_game_member(game_id, auth.uid()));

CREATE POLICY "narrator manages music"
  ON public.music_tracks FOR UPDATE TO authenticated
  USING (public.is_game_narrator(game_id, auth.uid()))
  WITH CHECK (public.is_game_narrator(game_id, auth.uid()));

CREATE POLICY "narrator or owner deletes music"
  ON public.music_tracks FOR DELETE TO authenticated
  USING (public.is_game_narrator(game_id, auth.uid()) OR added_by = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.music_tracks;

-- Shiny/Overgrown chance settings on games (percentages, 0-100)
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS shiny_chance INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS overgrown_chance INTEGER NOT NULL DEFAULT 0;