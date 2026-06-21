
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS effectiveness_flat boolean NOT NULL DEFAULT true;

ALTER TABLE public.pokemon REPLICA IDENTITY FULL;
ALTER TABLE public.trainers REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pokemon';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.trainers';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
