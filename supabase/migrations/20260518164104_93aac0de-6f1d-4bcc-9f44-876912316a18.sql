-- Extend attr_key enum and pokemon_type enum to fit Pokerole 2.0 dataset
ALTER TYPE public.attr_key ADD VALUE IF NOT EXISTS 'special';
ALTER TYPE public.pokemon_type ADD VALUE IF NOT EXISTS 'typeless';

-- Clear existing minimal seed; will be replaced by full Pokerole 2.0 data
TRUNCATE TABLE public.pokemon_moves CASCADE;
TRUNCATE TABLE public.species_moves CASCADE;
TRUNCATE TABLE public.species CASCADE;
TRUNCATE TABLE public.moves CASCADE;
TRUNCATE TABLE public.abilities CASCADE;
