DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.relname);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.relname);
  END LOOP;
END;$$;

-- Public read for reference data
GRANT SELECT ON public.species, public.moves, public.abilities, public.natures, public.species_moves TO anon;
GRANT SELECT ON public.profiles TO anon;