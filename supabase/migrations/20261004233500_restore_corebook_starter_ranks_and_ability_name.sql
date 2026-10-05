-- Restore the original Pokérole Corebook learn ranks overwritten by the
-- supplemental Paldea/Hisui catalog import. Corebook data is authoritative.
update public.species_moves sm
set min_rank = v.rank::public.pokerole_rank
from public.species s, public.moves m,
  (values
    ('Bulbasaur', 'Vine Whip', 'starter'),
    ('Charmander', 'Ember', 'starter'),
    ('Charmander', 'Flamethrower', 'amateur'),
    ('Squirtle', 'Water Gun', 'starter'),
    ('Squirtle', 'Bubble', 'starter')
  ) as v(species_name, move_name, rank)
where sm.species_id = s.id
  and sm.move_id = m.id
  and s.name = v.species_name
  and m.name = v.move_name;

-- Canonicalize the supplemental source's malformed "Compoundeyes" spelling.
update public.species
set abilities = array_replace(abilities, 'Compoundeyes', 'Compound Eyes')
where 'Compoundeyes' = any(abilities);

update public.species
set hidden_ability = 'Compound Eyes'
where hidden_ability = 'Compoundeyes';

delete from public.abilities
where name = 'Compoundeyes'
  and not exists (
    select 1 from public.species s
    where 'Compoundeyes' = any(s.abilities)
       or s.hidden_ability = 'Compoundeyes'
  );
