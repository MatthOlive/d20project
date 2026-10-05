-- Restore the complete original Corebook move availability for the four
-- starter species. Supplemental moves for all other species are untouched.
insert into public.species_moves (species_id, move_id, min_rank)
select s.id, m.id, expected.min_rank::public.pokerole_rank
from (values
  ('Bulbasaur', 'Tackle', 'starter'),
  ('Bulbasaur', 'Growl', 'starter'),
  ('Bulbasaur', 'Vine Whip', 'starter'),
  ('Bulbasaur', 'Leech Seed', 'beginner'),
  ('Bulbasaur', 'Razor Leaf', 'amateur'),
  ('Charmander', 'Scratch', 'starter'),
  ('Charmander', 'Growl', 'starter'),
  ('Charmander', 'Ember', 'starter'),
  ('Charmander', 'Quick Attack', 'beginner'),
  ('Charmander', 'Flamethrower', 'amateur'),
  ('Squirtle', 'Tackle', 'starter'),
  ('Squirtle', 'Tail Whip', 'starter'),
  ('Squirtle', 'Water Gun', 'starter'),
  ('Squirtle', 'Withdraw', 'beginner'),
  ('Squirtle', 'Bubble', 'starter'),
  ('Pikachu', 'Tackle', 'starter'),
  ('Pikachu', 'Growl', 'starter'),
  ('Pikachu', 'Thunder Shock', 'starter'),
  ('Pikachu', 'Quick Attack', 'beginner'),
  ('Pikachu', 'Thunderbolt', 'amateur')
) as expected(species_name, move_name, min_rank)
join public.species s on s.name = expected.species_name
join public.moves m on m.name = expected.move_name
on conflict (species_id, move_id) do update
set min_rank = excluded.min_rank;

