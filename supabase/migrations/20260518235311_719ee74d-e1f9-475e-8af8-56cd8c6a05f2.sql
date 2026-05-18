ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS narrator_type text NOT NULL DEFAULT 'human'
CHECK (narrator_type IN ('human', 'ai'));