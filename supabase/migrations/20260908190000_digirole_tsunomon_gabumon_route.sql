update public.digirole_species
set evolution_text = concat_ws(
  ' ; ',
  nullif(trim(coalesce(evolution_text, '')), ''),
  'Gabumon: PE 5 | Custo DS 1 | Rank = Rookie | STR 2 | DEX 2 | Fight 1 | Survival 1 | Conhecer 1 Técnica DR Grau II | Conhecer 1 Técnica NSp Grau II | Vínculo 2'
),
updated_at = now()
where lower(name) = 'tsunomon'
  and coalesce(evolution_text, '') not ilike '%Gabumon:%';

