ALTER TABLE public.music_tracks
  ADD COLUMN IF NOT EXISTS scenario_id uuid REFERENCES public.scenarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS volume integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS is_sfx boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hotkey text;

ALTER TABLE public.music_tracks
  DROP CONSTRAINT IF EXISTS music_tracks_volume_check;
ALTER TABLE public.music_tracks
  ADD CONSTRAINT music_tracks_volume_check CHECK (volume BETWEEN 0 AND 100);

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS master_volume integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS current_scenario_id uuid REFERENCES public.scenarios(id) ON DELETE SET NULL;

ALTER TABLE public.games
  DROP CONSTRAINT IF EXISTS games_master_volume_check;
ALTER TABLE public.games
  ADD CONSTRAINT games_master_volume_check CHECK (master_volume BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS music_tracks_scenario_idx ON public.music_tracks(scenario_id);