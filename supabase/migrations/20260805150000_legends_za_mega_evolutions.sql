-- Pokemon Legends: Z-A Mega Evolutions, converted to the PokeRole attribute scale.
-- Base stats and the 34 confirmed Mega abilities come from Serebii. Abilities for
-- DLC forms not yet present in the traditional battle list are conservative
-- project adaptations and are intentionally identified below.

with ability_seed(name, effect) as (
  values
    ('Anger Shell', $effect$The first time this Pokemon falls to half its total HP or less, reduce its Defense and Sp. Defense by 1, then increase its Strength, Special and Dexterity by 1.$effect$),
    ('Armor Tail', $effect$This Pokemon and its allies cannot be targeted by Priority Moves used by foes.$effect$),
    ('Beads of Ruin', $effect$While this Pokemon is on the battlefield, reduce the Sp. Defense of every other Pokemon by 1.$effect$),
    ('Costar', $effect$When this Pokemon enters battle, copy the current Attribute increases and reductions of one ally.$effect$),
    ('Cud Chew', $effect$When this Pokemon consumes a Berry, it receives that Berry's effect again at the end of the next Round.$effect$),
    ('Earth Eater', $effect$Ground-Type Moves do not damage this Pokemon. When it is hit by one, heal 1 HP instead.$effect$),
    ('Electromorphosis', $effect$After this Pokemon takes damage from an attack, add 1 Extra Die to the next Electric-Type Damage Pool it rolls.$effect$),
    ('Embody Aspect', $effect$When this Pokemon assumes a masked Terastal Form, increase the Attribute tied to its mask by 1: Dexterity for Teal, Strength for Hearthflame, Insight for Wellspring or Vitality for Cornerstone.$effect$),
    ('Good as Gold', $effect$Support Moves used by other Pokemon do not affect this Pokemon. Field effects and this Pokemon's own Moves still work normally.$effect$),
    ('Guard Dog', $effect$This Pokemon cannot be forced to switch out. If Intimidate would reduce its Strength, increase its Strength by 1 instead.$effect$),
    ('Hadron Engine', $effect$When this Pokemon enters battle, it starts Electric Terrain. While Electric Terrain is active, increase its Special Attribute by 1.$effect$),
    ('Hospitality', $effect$When this Pokemon enters battle, heal 1 HP from one ally in range.$effect$),
    ('Lingering Aroma', $effect$When a foe damages this Pokemon with a Contact Move, replace that foe's Ability with Lingering Aroma until the end of the scene.$effect$),
    ('Mind''s Eye', $effect$This Pokemon's Accuracy cannot be reduced and it ignores increases to a foe's Evasion. Its Normal and Fighting-Type Moves can affect Ghost-Type targets.$effect$),
    ('Mycelium Might', $effect$This Pokemon's Support Moves act last in the Round, but ignore Abilities that would prevent or redirect their effects.$effect$),
    ('Opportunist', $effect$Once per Round, when a foe increases an Attribute, increase the same Attribute of this Pokemon by 1.$effect$),
    ('Orichalcum Pulse', $effect$When this Pokemon enters battle, it starts Sunny Weather. While harsh sunlight is active, increase its Strength Attribute by 1.$effect$),
    ('Poison Puppeteer', $effect$Whenever a Move used by this Pokemon inflicts Poison, it also inflicts Confused on that target.$effect$),
    ('Protosynthesis', $effect$During harsh sunlight, or after consuming Booster Energy, increase this Pokemon's highest Attribute by 1 for the rest of the scene.$effect$),
    ('Purifying Salt', $effect$This Pokemon is immune to Status Conditions and reduces damage from Ghost-Type Moves by 1.$effect$),
    ('Quark Drive', $effect$During Electric Terrain, or after consuming Booster Energy, increase this Pokemon's highest Attribute by 1 for the rest of the scene.$effect$),
    ('Rocky Payload', $effect$Add 1 Extra Die to the Damage Pool of Rock-Type Moves used by this Pokemon.$effect$),
    ('Seed Sower', $effect$The first time this Pokemon is damaged by an attack during a scene, it starts Grassy Terrain.$effect$),
    ('Sharpness', $effect$Add 1 Die to the Damage Pool of slicing Moves used by this Pokemon.$effect$),
    ('Supreme Overlord', $effect$When this Pokemon enters battle, add 1 Die to its Damage Pools for each fainted ally in its party, up to 3 Dice.$effect$),
    ('Supersweet Syrup', $effect$The first time this Pokemon enters battle during a scene, reduce the Evasion of all foes in range by 1.$effect$),
    ('Sword of Ruin', $effect$While this Pokemon is on the battlefield, reduce the Defense of every other Pokemon by 1.$effect$),
    ('Tablets of Ruin', $effect$While this Pokemon is on the battlefield, reduce the Strength of every other Pokemon by 1.$effect$),
    ('Tera Shift', $effect$When this Pokemon enters battle, it immediately changes into its Terastal Form.$effect$),
    ('Tera Shell', $effect$While this Pokemon is at full HP, reduce damage from every Damaging Move that hits it by 1.$effect$),
    ('Teraform Zero', $effect$When this Pokemon changes into its Stellar Form, end all active Weather and Terrain effects.$effect$),
    ('Toxic Chain', $effect$After this Pokemon deals damage with a Move, roll 3 Chance Dice. If any die succeeds, inflict Poison on the target.$effect$),
    ('Toxic Debris', $effect$The first time this Pokemon takes damage from a Physical Move during a scene, scatter Toxic Spikes on the opposing side.$effect$),
    ('Vessel of Ruin', $effect$While this Pokemon is on the battlefield, reduce the Special Attribute of every other Pokemon by 1.$effect$),
    ('Well-Baked Body', $effect$Fire-Type Moves do not damage this Pokemon. The first time it is hit by one during a scene, increase its Defense by 2.$effect$),
    ('Wind Power', $effect$After this Pokemon is hit by a Wind Move, add 1 Extra Die to the next Electric-Type Damage Pool it rolls.$effect$),
    ('Wind Rider', $effect$Wind Moves do not damage this Pokemon. When Tailwind starts or a Wind Move targets it, increase its Strength by 1, up to 3 increases.$effect$),
    ('Zero to Hero', $effect$When this Pokemon switches out, change it into its Hero Form before it returns to battle.$effect$),
    ('Adaptability', $effect$Whenever this Pokemon uses a Damaging Move that matches its Type, add 1 Die to the Damage Pool of that attack.$effect$),
    ('Bad Dreams', $effect$At the end of the Round, deal 1 Damage to every Pokemon on the battlefield with the Sleep Status Condition.$effect$),
    ('Berserk', $effect$When this Pokemon has half its total HP or less, increase its Special Attribute by 1.$effect$),
    ('Bulletproof', $effect$Reduce by 1 all damage from Special and Ranged Physical Attacks dealt to this Pokemon.$effect$),
    ('Commander', $effect$If an allied Dondozo is on the field, this Pokemon may enter its mouth. While inside, it cannot be targeted or act, and Dondozo increases Strength, Dexterity, Vitality, Special and Insight by 2. The effect ends when Dondozo leaves the battle.$effect$),
    ('Contrary', $effect$If anything would decrease an Attribute of this Pokemon, increase it instead. If anything would increase an Attribute, decrease it instead.$effect$),
    ('Defiant', $effect$The first time this Pokemon has an Attribute reduced during a battle, increase its Strength by 2.$effect$),
    ('Dragonize', $effect$Normal-Type Attacks used by this Pokemon become Dragon-Type, affecting STAB, weakness and resistance. Add 1 Extra Die of Damage to Dragon-Type Moves.$effect$),
    ('Eelevate', $effect$Ground-Type Moves and ground hazards do not affect this Pokemon. Whenever it knocks out a target with an attack, increase its currently highest Attribute by 1, up to 3 increases.$effect$),
    ('Electric Surge', $effect$When this Pokemon enters battle, it automatically starts the effects of Electric Terrain.$effect$),
    ('Emergency Exit', $effect$Whenever this Pokemon reaches half or less of its total HP, it switches out and an ally may take its place. If there is no ally, the battle may end.$effect$),
    ('Fairy Aura', $effect$Add 2 Dice to the Damage Pools of Fairy-Type Moves used by all Pokemon on the field. This effect does not stack.$effect$),
    ('Fire Mane', $effect$Add 1 Extra Die to the Damage Pool of Fire-Type Moves used by this Pokemon.$effect$),
    ('Flash Fire', $effect$Fire-Type Moves do not damage this Pokemon. After it is first hit by one, add 1 Extra Die to its Fire-Type Damage Pools until the end of the scene.$effect$),
    ('Huge Power', $effect$This Pokemon has a permanent increase of 1 point to its Strength Attribute.$effect$),
    ('Infiltrator', $effect$Shield Moves, Safeguard, Substitute, Light Screen and Reflect are ignored by this Pokemon.$effect$),
    ('Innards Out', $effect$If an attack makes this Pokemon faint, it deals damage to the attacker equal to the HP it had immediately before that attack.$effect$),
    ('Intimidate', $effect$When this Pokemon enters battle, reduce the Strength of all foes in range by 1 while this Pokemon remains on the field.$effect$),
    ('Iron Fist', $effect$Add 1 Die to the Damage Pool of Fist-Based Moves.$effect$),
    ('Levitate', $effect$Ground-Type Moves and effects on the ground do not affect this Pokemon. The effect is lost while it is bound to the ground.$effect$),
    ('Magic Bounce', $effect$Support Moves that target this Pokemon or its side of the battlefield are redirected to the opposing side.$effect$),
    ('Mega Sol', $effect$This Pokemon uses its Moves as though harsh sunlight were active, even when the current weather is different.$effect$),
    ('Mold Breaker', $effect$Ignore a foe's Type immunity or Ability when it would prevent this Pokemon from attacking with a Move.$effect$),
    ('Multiscale', $effect$If this Pokemon was at full HP, reduce the damage dealt by an attack by 1.$effect$),
    ('No Guard', $effect$At the start of the Round, this Pokemon may give up all Evasion Actions. If it does, roll its Moves without reduced accuracy.$effect$),
    ('Piercing Drill', $effect$Contact Moves can strike through Protect and similar Shield effects. When they do, apply all non-protective effects but deal one quarter of the final damage, with a minimum of 1.$effect$),
    ('Power Construct', $effect$At the end of the Round, if this Pokemon has half or less of its total HP, change it to the next Zygarde Form, remove Status Ailments and restore its HP and Will.$effect$),
    ('Prankster', $effect$Add Priority +1 to all Support Moves used by this Pokemon.$effect$),
    ('Protean', $effect$Before this Pokemon uses a Move, change its Type to the Move's Type. Damaging Moves use the appropriate STAB.$effect$),
    ('Regenerator', $effect$Outside combat, this Pokemon may heal up to 4 Damage or 2 Lethal Damage on its own each day.$effect$),
    ('Shell Armor', $effect$Critical Hits against this Pokemon do not gain their Bonus Damage Dice.$effect$),
    ('Snow Warning', $effect$When this Pokemon enters battle, it automatically starts Hail Weather. The effect ends when it leaves the battle.$effect$),
    ('Soul Heart', $effect$If a foe faints because of an attack from this Pokemon, increase its Special Attribute by 1, up to 3 increases.$effect$),
    ('Speed Boost', $effect$At the end of the Round, increase this Pokemon's Dexterity by 1, up to 3 increases.$effect$),
    ('Spicy Spray', $effect$Whenever this Pokemon takes damage from a Move, inflict the Burn Status on the attacker.$effect$),
    ('Stalwart', $effect$Ignore Moves and Abilities that would redirect this Pokemon's Moves to another target.$effect$),
    ('Technician', $effect$Add 1 Die to the Damage Pool of all Moves with Power 2 or less.$effect$),
    ('Thermal Exchange', $effect$This Pokemon cannot be Burned. The first time it is hit by a Fire-Type Move during a Round, increase its Strength by 1, up to 3 increases.$effect$),
    ('Tough Claws', $effect$Whenever this Pokemon uses a Non-Ranged Physical Attack, add 1 Die to its Damage Pool.$effect$),
    ('Trace', $effect$When this Pokemon enters battle, it copies one random foe Ability until it leaves. Unique transformation Abilities cannot be copied.$effect$),
    ('Unseen Fist', $effect$Contact Moves used by this Pokemon ignore Protect and similar Shield Moves, but not Max Guard.$effect$),
    ('Volt Absorb', $effect$Electric-Type Moves do not damage this Pokemon. When hit by one, it may heal 1 HP.$effect$)
)
insert into public.abilities(name, effect)
select name, effect from ability_seed
on conflict (name) do update
set effect = excluded.effect
where nullif(btrim(public.abilities.effect), '') is null;

create temporary table za_mega_seed (
  base_name text not null,
  name text not null,
  dex_number integer not null,
  types text[] not null,
  attack integer not null,
  defense integer not null,
  special_attack integer not null,
  special_defense integer not null,
  speed integer not null,
  ability text not null,
  is_legendary boolean not null default false
);

insert into za_mega_seed(base_name, name, dex_number, types, attack, defense, special_attack, special_defense, speed, ability, is_legendary)
values
  -- Project adaptations until these DLC forms receive a traditional-battle
  -- assignment: Absol Z/Technician, Garchomp Z/Speed Boost,
  -- Lucario Z/Prankster, Heatran/Flash Fire, Darkrai/Bad Dreams,
  -- Zygarde/Power Construct, Golisopod/Emergency Exit,
  -- Magearna/Soul Heart, Zeraora/Volt Absorb, Tatsugiri/Commander
  -- and Baxcalibur/Thermal Exchange.
  ('Raichu', 'Raichu (Mega X Form)', 26, array['electric'], 135, 95, 90, 95, 110, 'Electric Surge', false),
  ('Raichu', 'Raichu (Mega Y Form)', 26, array['electric'], 100, 55, 160, 80, 130, 'No Guard', false),
  ('Clefable', 'Clefable (Mega Form)', 36, array['fairy','flying'], 80, 93, 135, 110, 70, 'Magic Bounce', false),
  ('Victreebel', 'Victreebel (Mega Form)', 71, array['grass','poison'], 125, 85, 135, 95, 70, 'Innards Out', false),
  ('Starmie', 'Starmie (Mega Form)', 121, array['water','psychic'], 140, 105, 130, 105, 120, 'Huge Power', false),
  ('Dragonite', 'Dragonite (Mega Form)', 149, array['dragon','flying'], 124, 115, 145, 125, 100, 'Multiscale', false),
  ('Meganium', 'Meganium (Mega Form)', 154, array['grass','fairy'], 92, 115, 143, 115, 80, 'Mega Sol', false),
  ('Feraligatr', 'Feraligatr (Mega Form)', 160, array['water','dragon'], 160, 125, 89, 93, 78, 'Dragonize', false),
  ('Skarmory', 'Skarmory (Mega Form)', 227, array['steel','flying'], 140, 110, 40, 100, 110, 'Stalwart', false),
  ('Chimecho', 'Chimecho (Mega Form)', 358, array['psychic','steel'], 50, 110, 135, 120, 65, 'Levitate', false),
  ('Absol', 'Absol (Mega Z Form)', 359, array['dark','ghost'], 154, 60, 75, 60, 151, 'Technician', false),
  ('Staraptor', 'Staraptor (Mega Form)', 398, array['flying','fighting'], 140, 100, 60, 90, 110, 'Contrary', false),
  ('Garchomp', 'Garchomp (Mega Z Form)', 445, array['dragon','ground'], 130, 85, 141, 85, 151, 'Speed Boost', false),
  ('Lucario', 'Lucario (Mega Z Form)', 448, array['fighting','steel'], 100, 70, 164, 70, 151, 'Prankster', false),
  ('Froslass', 'Froslass (Mega Form)', 478, array['ice','ghost'], 80, 70, 140, 100, 120, 'Snow Warning', false),
  ('Heatran', 'Heatran (Mega Form)', 485, array['fire','steel'], 120, 106, 175, 141, 67, 'Flash Fire', true),
  ('Darkrai', 'Darkrai (Mega Form)', 491, array['dark','ghost'], 120, 130, 165, 130, 85, 'Bad Dreams', true),
  ('Emboar', 'Emboar (Mega Form)', 500, array['fire','fighting'], 148, 75, 110, 110, 75, 'Mold Breaker', false),
  ('Excadrill', 'Excadrill (Mega Form)', 530, array['ground','steel'], 165, 100, 65, 65, 103, 'Piercing Drill', false),
  ('Scolipede', 'Scolipede (Mega Form)', 545, array['bug','poison'], 140, 149, 75, 99, 62, 'Shell Armor', false),
  ('Scrafty', 'Scrafty (Mega Form)', 560, array['dark','fighting'], 130, 135, 55, 135, 68, 'Intimidate', false),
  ('Eelektross', 'Eelektross (Mega Form)', 604, array['electric'], 145, 80, 135, 90, 80, 'Eelevate', false),
  ('Chandelure', 'Chandelure (Mega Form)', 609, array['ghost','fire'], 75, 110, 175, 110, 90, 'Infiltrator', false),
  ('Golurk', 'Golurk (Mega Form)', 623, array['ground','ghost'], 159, 105, 70, 105, 55, 'Unseen Fist', false),
  ('Chesnaught', 'Chesnaught (Mega Form)', 652, array['grass','fighting'], 137, 172, 74, 115, 44, 'Bulletproof', false),
  ('Delphox', 'Delphox (Mega Form)', 655, array['fire','psychic'], 69, 72, 159, 125, 134, 'Levitate', false),
  ('Greninja', 'Greninja (Mega Form)', 658, array['water','dark'], 125, 77, 133, 81, 142, 'Protean', false),
  ('Pyroar', 'Pyroar (Mega Form)', 668, array['fire','normal'], 88, 92, 129, 86, 126, 'Fire Mane', false),
  ('Floette', 'Floette (Mega Form)', 670, array['fairy'], 85, 87, 155, 148, 102, 'Fairy Aura', false),
  ('Meowstic', 'Meowstic (Mega Form)', 678, array['psychic'], 48, 76, 143, 101, 124, 'Trace', false),
  ('Malamar', 'Malamar (Mega Form)', 687, array['dark','psychic'], 102, 88, 98, 120, 88, 'Contrary', false),
  ('Barbaracle', 'Barbaracle (Mega Form)', 689, array['rock','fighting'], 140, 130, 64, 106, 88, 'Tough Claws', false),
  ('Dragalge', 'Dragalge (Mega Form)', 691, array['poison','dragon'], 85, 105, 132, 163, 44, 'Regenerator', false),
  ('Hawlucha', 'Hawlucha (Mega Form)', 701, array['fighting','flying'], 137, 100, 74, 93, 118, 'No Guard', false),
  ('Zygarde 100%', 'Zygarde (Mega Form)', 718, array['dragon','ground'], 70, 91, 216, 85, 100, 'Power Construct', true),
  ('Crabominable', 'Crabominable (Mega Form)', 740, array['fighting','ice'], 157, 122, 62, 107, 33, 'Iron Fist', false),
  ('Golisopod', 'Golisopod (Mega Form)', 768, array['bug','steel'], 150, 175, 70, 120, 40, 'Emergency Exit', false),
  ('Drampa', 'Drampa (Mega Form)', 780, array['normal','dragon'], 85, 110, 160, 116, 36, 'Berserk', false),
  ('Magearna', 'Magearna (Mega Form)', 801, array['steel','fairy'], 125, 115, 170, 115, 95, 'Soul Heart', true),
  ('Magearna', 'Magearna (Original Color Mega Form)', 801, array['steel','fairy'], 125, 115, 170, 115, 95, 'Soul Heart', true),
  ('Zeraora', 'Zeraora (Mega Form)', 807, array['electric'], 157, 75, 147, 80, 153, 'Volt Absorb', true),
  ('Falinks', 'Falinks (Mega Form)', 870, array['fighting'], 135, 135, 70, 65, 100, 'Defiant', false),
  ('Scovillain', 'Scovillain (Mega Form)', 952, array['grass','fire'], 138, 85, 138, 85, 75, 'Spicy Spray', false),
  ('Glimmora', 'Glimmora (Mega Form)', 970, array['rock','poison'], 90, 105, 150, 96, 101, 'Adaptability', false),
  ('Tatsugiri', 'Tatsugiri (Curly Mega Form)', 978, array['dragon','water'], 65, 90, 135, 125, 92, 'Commander', false),
  ('Tatsugiri', 'Tatsugiri (Droopy Mega Form)', 978, array['dragon','water'], 65, 90, 135, 125, 92, 'Commander', false),
  ('Tatsugiri', 'Tatsugiri (Stretchy Mega Form)', 978, array['dragon','water'], 65, 90, 135, 125, 92, 'Commander', false),
  ('Baxcalibur', 'Baxcalibur (Mega Form)', 998, array['dragon','ice'], 175, 117, 105, 101, 87, 'Thermal Exchange', false);

with prepared as (
  select
    seed.*,
    base.base_hp,
    base.base_attrs as original_base_attrs,
    base.attr_limits as original_attr_limits,
    base.suggested_rank as original_rank,
    base.sprite_url,
    base.is_legendary as original_is_legendary,
    jsonb_build_object(
      'strength', greatest(coalesce((base.attr_limits->>'strength')::integer, 1), ceil(seed.attack / 20.0)::integer),
      'dexterity', greatest(coalesce((base.attr_limits->>'dexterity')::integer, 1), ceil(seed.speed / 20.0)::integer),
      'vitality', greatest(coalesce((base.attr_limits->>'vitality')::integer, 1), ceil(seed.defense / 20.0)::integer),
      'special', greatest(coalesce((base.attr_limits->>'special')::integer, 1), ceil(seed.special_attack / 20.0)::integer),
      'insight', greatest(coalesce((base.attr_limits->>'insight')::integer, 1), ceil(seed.special_defense / 20.0)::integer)
    ) as mega_limits
  from za_mega_seed seed
  join public.species base on base.name = seed.base_name
), converted as (
  select
    prepared.*,
    jsonb_build_object(
      'strength', greatest(coalesce((original_base_attrs->>'strength')::integer, 1), floor((mega_limits->>'strength')::integer / 2.0)::integer),
      'dexterity', greatest(coalesce((original_base_attrs->>'dexterity')::integer, 1), floor((mega_limits->>'dexterity')::integer / 2.0)::integer),
      'vitality', greatest(coalesce((original_base_attrs->>'vitality')::integer, 1), floor((mega_limits->>'vitality')::integer / 2.0)::integer),
      'special', greatest(coalesce((original_base_attrs->>'special')::integer, 1), floor((mega_limits->>'special')::integer / 2.0)::integer),
      'insight', greatest(coalesce((original_base_attrs->>'insight')::integer, 1), floor((mega_limits->>'insight')::integer / 2.0)::integer)
    ) as mega_base_attrs
  from prepared
)
insert into public.species(
  dex_number, name, types, base_hp, base_attrs, attr_limits, abilities,
  hidden_ability, suggested_rank, sprite_url, evolutions, evolution_method,
  is_starter, is_legendary
)
select
  dex_number,
  name,
  types::public.pokemon_type[],
  base_hp,
  mega_base_attrs,
  mega_limits,
  array[ability],
  null,
  case
    when original_rank = 'master' then 'master'::public.pokerole_rank
    when original_rank = 'pro' or attack + defense + special_attack + special_defense + speed >= 600 then 'pro'::public.pokerole_rank
    else 'ace'::public.pokerole_rank
  end,
  sprite_url,
  '{}'::text[],
  jsonb_build_object('method', 'mega', 'reversible', true),
  false,
  is_legendary or coalesce(original_is_legendary, false)
from converted
on conflict (name) do update set
  dex_number = excluded.dex_number,
  types = excluded.types,
  base_hp = excluded.base_hp,
  base_attrs = excluded.base_attrs,
  attr_limits = excluded.attr_limits,
  abilities = excluded.abilities,
  hidden_ability = excluded.hidden_ability,
  suggested_rank = excluded.suggested_rank,
  evolution_method = excluded.evolution_method,
  is_legendary = excluded.is_legendary;

with grouped as (
  select base_name, array_agg(name order by name) as targets
  from za_mega_seed
  group by base_name
)
update public.species base
set evolutions = coalesce(base.evolutions, '{}'::text[]) || array(
  select target
  from unnest(grouped.targets) target
  where not (target = any(coalesce(base.evolutions, '{}'::text[])))
)
from grouped
where base.name = grouped.base_name;

insert into public.species_moves(species_id, move_id, min_rank)
select mega.id, source_moves.move_id, source_moves.min_rank
from za_mega_seed seed
join public.species base on base.name = seed.base_name
join public.species mega on mega.name = seed.name
join public.species_moves source_moves on source_moves.species_id = base.id
on conflict (species_id, move_id) do update
set min_rank = excluded.min_rank;

drop table za_mega_seed;
