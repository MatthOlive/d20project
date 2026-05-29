
-- Add starter/legendary flags to species
ALTER TABLE public.species
  ADD COLUMN IF NOT EXISTS is_starter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_legendary boolean NOT NULL DEFAULT false;

-- Permission arrays on pokemon and trainers
ALTER TABLE public.pokemon
  ADD COLUMN IF NOT EXISTS allowed_editors uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_viewers uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS allowed_editors uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_viewers uuid[] NOT NULL DEFAULT '{}';

-- Replace SELECT policy on pokemon
DROP POLICY IF EXISTS "members view pokemon" ON public.pokemon;
CREATE POLICY "members view pokemon"
ON public.pokemon FOR SELECT TO authenticated
USING (
  is_game_member(game_id, auth.uid())
  AND (
    cardinality(allowed_viewers) = 0
    OR owner_id = auth.uid()
    OR is_game_narrator(game_id, auth.uid())
    OR auth.uid() = ANY(allowed_viewers)
  )
);

DROP POLICY IF EXISTS "owner or narrator edits pokemon" ON public.pokemon;
CREATE POLICY "owner or narrator edits pokemon"
ON public.pokemon FOR UPDATE TO authenticated
USING (
  can_edit_character(game_id, owner_id)
  OR auth.uid() = ANY(allowed_editors)
);

-- Same for trainers
DROP POLICY IF EXISTS "members or narrator view trainers" ON public.trainers;
CREATE POLICY "members or narrator view trainers"
ON public.trainers FOR SELECT TO authenticated
USING (
  (is_game_member(game_id, auth.uid()) OR is_game_narrator(game_id, auth.uid()))
  AND (
    cardinality(allowed_viewers) = 0
    OR owner_id = auth.uid()
    OR is_game_narrator(game_id, auth.uid())
    OR auth.uid() = ANY(allowed_viewers)
  )
);

DROP POLICY IF EXISTS "owner or narrator edits trainer" ON public.trainers;
CREATE POLICY "owner or narrator edits trainer"
ON public.trainers FOR UPDATE TO authenticated
USING (
  can_edit_character(game_id, owner_id)
  OR auth.uid() = ANY(allowed_editors)
);

-- Populate starters: regional starter base forms + Pikachu + Eevee
UPDATE public.species SET is_starter = true
WHERE name IN (
  'Bulbasaur','Charmander','Squirtle',
  'Chikorita','Cyndaquil','Totodile',
  'Treecko','Torchic','Mudkip',
  'Turtwig','Chimchar','Piplup',
  'Snivy','Tepig','Oshawott',
  'Chespin','Fennekin','Froakie',
  'Rowlet','Litten','Popplio',
  'Grookey','Scorbunny','Sobble',
  'Sprigatito','Fuecoco','Quaxly',
  'Pikachu','Eevee'
);

-- Populate legendaries (matches base name + any form variant like "(Mega Form)", "(Galarian Form)")
WITH legendary_names(base) AS (
  VALUES
    ('Articuno'),('Zapdos'),('Moltres'),('Mewtwo'),('Mew'),
    ('Raikou'),('Entei'),('Suicune'),('Lugia'),('Ho-Oh'),('Celebi'),
    ('Regirock'),('Regice'),('Registeel'),('Latias'),('Latios'),
    ('Kyogre'),('Groudon'),('Rayquaza'),('Jirachi'),('Deoxys'),
    ('Uxie'),('Mesprit'),('Azelf'),('Dialga'),('Palkia'),('Heatran'),
    ('Regigigas'),('Giratina'),('Cresselia'),('Phione'),('Manaphy'),
    ('Darkrai'),('Shaymin'),('Arceus'),
    ('Victini'),('Cobalion'),('Terrakion'),('Virizion'),
    ('Tornadus'),('Thundurus'),('Landorus'),('Reshiram'),('Zekrom'),('Kyurem'),
    ('Keldeo'),('Meloetta'),('Genesect'),
    ('Xerneas'),('Yveltal'),('Zygarde'),('Diancie'),('Hoopa'),('Volcanion'),
    ('Type: Null'),('Silvally'),
    ('Tapu Koko'),('Tapu Lele'),('Tapu Bulu'),('Tapu Fini'),
    ('Cosmog'),('Cosmoem'),('Solgaleo'),('Lunala'),('Necrozma'),
    ('Magearna'),('Marshadow'),('Zeraora'),('Meltan'),('Melmetal'),
    ('Zacian'),('Zamazenta'),('Eternatus'),('Kubfu'),('Urshifu'),
    ('Regieleki'),('Regidrago'),('Glastrier'),('Spectrier'),('Calyrex'),
    ('Enamorus')
)
UPDATE public.species s SET is_legendary = true
FROM legendary_names l
WHERE s.name = l.base OR s.name LIKE l.base || ' (%';
