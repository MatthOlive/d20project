-- Adds Paldea/Hisui evolution destinations without replacing legacy routes.
-- Special requirements are evaluated by src/lib/paldea-hisui-evolutions.ts.
-- Sources:
-- https://www.serebii.net/scarletviolet/evolution.shtml
-- https://www.serebii.net/legendsarceus/evolution.shtml

with routes(from_name, to_name) as (
  values
    ('Voltorb (Hisuian Form)', 'Electrode (Hisuian Form)'),
    ('Growlithe (Hisuian Form)', 'Arcanine (Hisuian Form)'),
    ('Quilava', 'Typhlosion (Hisuian Form)'),
    ('Dewott', 'Samurott (Hisuian Form)'),
    ('Dartrix', 'Decidueye (Hisuian Form)'),
    ('Petilil', 'Lilligant (Hisuian Form)'),
    ('Goomy', 'Sliggoo (Hisuian Form)'),
    ('Sliggoo (Hisuian Form)', 'Goodra (Hisuian Form)'),
    ('Zorua (Hisuian Form)', 'Zoroark (Hisuian Form)'),
    ('Rufflet', 'Braviary (Hisuian Form)'),
    ('Bergmite', 'Avalugg (Hisuian Form)'),
    ('Qwilfish (Hisuian Form)', 'Overqwil'),
    ('Sneasel (Hisuian Form)', 'Sneasler'),
    ('Stantler', 'Wyrdeer'),
    ('Scyther', 'Kleavor'),
    ('Ursaring', 'Ursaluna'),
    ('Basculin (White-Striped Form)', 'Basculegion'),
    ('Sprigatito', 'Floragato'),
    ('Floragato', 'Meowscarada'),
    ('Fuecoco', 'Crocalor'),
    ('Crocalor', 'Skeledirge'),
    ('Quaxly', 'Quaxwell'),
    ('Quaxwell', 'Quaquaval'),
    ('Lechonk', 'Oinkologne'),
    ('Tarountula', 'Spidops'),
    ('Nymble', 'Lokix'),
    ('Pawmi', 'Pawmo'),
    ('Pawmo', 'Pawmot'),
    ('Tandemaus', 'Maushold'),
    ('Fidough', 'Dachsbun'),
    ('Smoliv', 'Dolliv'),
    ('Dolliv', 'Arboliva'),
    ('Nacli', 'Naclstack'),
    ('Naclstack', 'Garganacl'),
    ('Charcadet', 'Armarouge'),
    ('Charcadet', 'Ceruledge'),
    ('Tadbulb', 'Bellibolt'),
    ('Wattrel', 'Kilowattrel'),
    ('Maschiff', 'Mabosstiff'),
    ('Shroodle', 'Grafaiai'),
    ('Bramblin', 'Brambleghast'),
    ('Toedscool', 'Toedscruel'),
    ('Capsakid', 'Scovillain'),
    ('Rellor', 'Rabsca'),
    ('Flittle', 'Espathra'),
    ('Tinkatink', 'Tinkatuff'),
    ('Tinkatuff', 'Tinkaton'),
    ('Wiglett', 'Wugtrio'),
    ('Finizen', 'Palafin'),
    ('Varoom', 'Revavroom'),
    ('Glimmet', 'Glimmora'),
    ('Greavard', 'Houndstone'),
    ('Cetoddle', 'Cetitan'),
    ('Frigibax', 'Arctibax'),
    ('Arctibax', 'Baxcalibur'),
    ('Gimmighoul', 'Gholdengo'),
    ('Wooper (Paldean Form)', 'Clodsire'),
    ('Primeape', 'Annihilape'),
    ('Girafarig', 'Farigiraf'),
    ('Dunsparce', 'Dudunsparce'),
    ('Bisharp', 'Kingambit'),
    ('Crabrawler', 'Crabominable'),
    ('Kadabra', 'Alakazam'),
    ('Machoke', 'Machamp'),
    ('Graveler', 'Golem'),
    ('Haunter', 'Gengar'),
    ('Nosepass', 'Probopass')
), grouped as (
  select from_name, array_agg(distinct to_name order by to_name) as targets
  from routes
  group by from_name
)
update public.species as species
set evolutions = coalesce(
  array(
    select existing_target
    from unnest(coalesce(species.evolutions, '{}'::text[])) as existing_target
    where nullif(btrim(existing_target), '') is not null
      and lower(btrim(existing_target)) <> 'none'
  ),
  '{}'::text[]
) || array(
  select target
  from unnest(grouped.targets) as target
  where not (target = any(coalesce(species.evolutions, '{}'::text[])))
)
from grouped
where species.name = grouped.from_name;
