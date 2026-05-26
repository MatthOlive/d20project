ALTER TABLE public.pokemon
ADD COLUMN IF NOT EXISTS is_shiny boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_overgrown boolean NOT NULL DEFAULT false;