-- Restore official Pokérole 2.0 move data after the supplemental catalog import.
-- The import is allowed to add missing content, but the Corebook remains
-- authoritative for rows that already existed in the base catalog.
update public.moves
set accuracy_stat = 'tough/cute',
    accuracy_skill = 'perform',
    effect = 'Sound Based. Reduce the foe’s Strength by 1.',
    target = 'foe'
where lower(name) = 'growl';

update public.moves
set accuracy_stat = 'cute',
    accuracy_skill = 'perform',
    effect = 'Reduce the foe’s Defense by 1.',
    target = 'foe'
where lower(name) = 'tail whip';

update public.moves
set effect = 'Target all foes in Range. Roll 1 Chance Die to reduce the affected foes’ Dexterity.'
where lower(name) = 'bubble';

update public.moves
set effect = 'If successful, spend 1 Will point to activate. At the end of each Round, roll 1 die of damage to the foe. The user heals 1 HP for every damage dealt this way. Grass-type Pokémon are immune to this move.'
where lower(name) = 'leech seed';

update public.moves
set accuracy_stat = 'vitality',
    accuracy_skill = 'brawl',
    effect = 'Increase the user’s Defense by 1.'
where lower(name) = 'withdraw';

update public.moves
set accuracy_stat = 'insight',
    accuracy_skill = 'empathy'
where lower(name) = 'simple beam';

update public.moves
set accuracy_stat = 'clever',
    accuracy_skill = 'medicine'
where lower(name) = 'stabilize an ally';
