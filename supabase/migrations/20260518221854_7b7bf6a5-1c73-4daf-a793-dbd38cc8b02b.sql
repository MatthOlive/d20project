ALTER TABLE public.pokemon ADD COLUMN IF NOT EXISTS folder text;
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS folder text;
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS bag text NOT NULL DEFAULT '';
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS battle_items text NOT NULL DEFAULT '';