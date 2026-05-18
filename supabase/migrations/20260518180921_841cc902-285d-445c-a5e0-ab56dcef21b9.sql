ALTER TABLE public.moves ALTER COLUMN accuracy_stat TYPE text USING accuracy_stat::text;
ALTER TABLE public.moves ALTER COLUMN damage_stat TYPE text USING damage_stat::text;