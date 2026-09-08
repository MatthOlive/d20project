update public.digirole_species
set evolution_text = concat_ws(
  ' ; ',
  nullif(trim(coalesce(evolution_text, '')), ''),
  'Yokomon: PE 2 | Custo DS 1 | Rank = In-Training II'
)
where lower(name) = 'biyomon'
  and coalesce(evolution_text, '') not ilike '%Yokomon:%';

update public.digirole_species
set evolution_text = concat_ws(
  ' ; ',
  nullif(trim(coalesce(evolution_text, '')), ''),
  'Tumblemon: PE 2 | Custo DS 1 | Rank = In-Training II'
)
where lower(name) = 'sandmon'
  and coalesce(evolution_text, '') not ilike '%Tumblemon:%';
