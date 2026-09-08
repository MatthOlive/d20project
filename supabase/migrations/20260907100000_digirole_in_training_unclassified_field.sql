-- In-Training I Digimon do not have a natural Field.
-- Unclassified is the neutral Field used by the sheet and technique rules.
update public.digirole_species
set fields = array['Unclassified']::text[]
where stage = 'In-Training I'
  and fields is distinct from array['Unclassified']::text[];
