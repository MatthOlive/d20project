
alter function public.handle_new_user() set search_path = public;
alter function public.add_narrator_as_member() set search_path = public;
alter function public.enforce_pokemon_move_cap() set search_path = public;
alter function public.enforce_trainer_move_cap() set search_path = public;

revoke execute on function public.is_game_member(uuid, uuid) from public, anon;
revoke execute on function public.is_game_narrator(uuid, uuid) from public, anon;
revoke execute on function public.can_edit_character(uuid, uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_narrator_as_member() from public, anon, authenticated;
revoke execute on function public.enforce_pokemon_move_cap() from public, anon, authenticated;
revoke execute on function public.enforce_trainer_move_cap() from public, anon, authenticated;

insert into public.moves (name, type, power, accuracy_stat, accuracy_skill, damage_stat, effect, category) values
('Tackle','normal',2,'dexterity','brawl','strength','Basic physical hit.','physical'),
('Scratch','normal',2,'dexterity','brawl','strength','Sharp claws.','physical'),
('Growl','normal',0,'insight','empathy',null,'Lowers target damage rolls.','status'),
('Tail Whip','normal',0,'dexterity','alert',null,'Lowers target defense.','status'),
('Ember','fire',2,'dexterity','channel',null,'Burn 1.','special'),
('Flamethrower','fire',4,'dexterity','channel',null,'Burn 1.','special'),
('Vine Whip','grass',2,'dexterity','brawl','strength','Quick whip.','physical'),
('Razor Leaf','grass',3,'dexterity','channel','strength','High crit.','physical'),
('Water Gun','water',2,'dexterity','channel',null,'Splash.','special'),
('Bubble','water',2,'dexterity','channel',null,'Lowers dexterity.','special'),
('Thunder Shock','electric',2,'dexterity','channel',null,'Paralyze 1.','special'),
('Thunderbolt','electric',4,'dexterity','channel',null,'Paralyze 1.','special'),
('Quick Attack','normal',2,'dexterity','brawl','strength','Priority.','physical'),
('Leech Seed','grass',0,'insight','channel',null,'Drains HP.','status'),
('Withdraw','water',0,'insight','channel',null,'Raises defense.','status');

insert into public.species (dex_number, name, types, base_hp, base_attrs, attr_limits, abilities, hidden_ability, suggested_rank, sprite_url) values
(1,'Bulbasaur', array['grass','poison']::pokemon_type[], 5,
  '{"strength":2,"dexterity":2,"vitality":3,"insight":2,"toughness":2}'::jsonb,
  '{"strength":4,"dexterity":4,"vitality":5,"insight":4,"toughness":4}'::jsonb,
  array['Overgrow'], 'Chlorophyll', 'starter',
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'),
(4,'Charmander', array['fire']::pokemon_type[], 4,
  '{"strength":2,"dexterity":3,"vitality":2,"insight":2,"toughness":1}'::jsonb,
  '{"strength":4,"dexterity":5,"vitality":4,"insight":4,"toughness":3}'::jsonb,
  array['Blaze'], 'Solar Power', 'starter',
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png'),
(7,'Squirtle', array['water']::pokemon_type[], 5,
  '{"strength":2,"dexterity":2,"vitality":3,"insight":2,"toughness":3}'::jsonb,
  '{"strength":4,"dexterity":4,"vitality":5,"insight":4,"toughness":5}'::jsonb,
  array['Torrent'], 'Rain Dish', 'starter',
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png'),
(25,'Pikachu', array['electric']::pokemon_type[], 4,
  '{"strength":2,"dexterity":4,"vitality":2,"insight":3,"toughness":2}'::jsonb,
  '{"strength":3,"dexterity":5,"vitality":4,"insight":5,"toughness":3}'::jsonb,
  array['Static'], 'Lightning Rod', 'beginner',
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png');

insert into public.species_moves (species_id, move_id, min_rank)
select s.id, m.id, r::pokerole_rank
from (values
  ('Bulbasaur','Tackle','starter'),('Bulbasaur','Growl','starter'),
  ('Bulbasaur','Vine Whip','starter'),('Bulbasaur','Leech Seed','beginner'),
  ('Bulbasaur','Razor Leaf','amateur'),
  ('Charmander','Scratch','starter'),('Charmander','Growl','starter'),
  ('Charmander','Ember','starter'),('Charmander','Quick Attack','beginner'),
  ('Charmander','Flamethrower','amateur'),
  ('Squirtle','Tackle','starter'),('Squirtle','Tail Whip','starter'),
  ('Squirtle','Water Gun','starter'),('Squirtle','Withdraw','beginner'),
  ('Squirtle','Bubble','starter'),
  ('Pikachu','Tackle','starter'),('Pikachu','Growl','starter'),
  ('Pikachu','Thunder Shock','starter'),('Pikachu','Quick Attack','beginner'),
  ('Pikachu','Thunderbolt','amateur')
) as v(species_name, move_name, r)
join public.species s on s.name = v.species_name
join public.moves m on m.name = v.move_name;

insert into public.abilities (name, effect) values
('Overgrow','When HP is low, Grass moves hit harder.'),
('Chlorophyll','Faster in sunny weather.'),
('Blaze','When HP is low, Fire moves hit harder.'),
('Solar Power','Boosts Special damage in sun.'),
('Torrent','When HP is low, Water moves hit harder.'),
('Rain Dish','Recovers HP in rain.'),
('Static','May paralyze on contact.'),
('Lightning Rod','Draws Electric moves to itself.');
