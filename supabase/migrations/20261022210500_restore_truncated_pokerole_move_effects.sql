-- Restore only known-truncated canonical move descriptions from the supplied
-- Pokérole 2.0 Corebook. The old-value guard preserves any user edits.
UPDATE public.moves AS m
SET effect = fixes.corrected_effect
FROM (VALUES
  (
    'Fell Stinger',
    'If the foe faints due to damage from this attack, Increase the',
    'If the foe faints due to damage from this attack, Increase the user''s Strength by 2.'
  ),
  (
    'Electro Ball',
    'Add 1 Extra Dice to',
    'Add 1 Extra Dice to the Damage Pool of the user for every Special Point on Dexterity it has that surpasses the Foe''s. Up to 4 Dice might be added this way.'
  ),
  (
    'Endeavor',
    'Roll Damage equal to',
    'Roll Damage equal to the Difference between user''s Full HP and its Current HP (up to 10). User cannot reduce the target''s HP to lower than its own remaining HP.'
  ),
  (
    'Guillotine',
    'Deal Damage equal to',
    'Deal Damage equal to the Target''s Remaining HP, plus 1 Lethal Damage.'
  ),
  (
    'High Jump Kick',
    'If Accuracy Roll is unsuccessful, deal 5 Dice of Damage to',
    'If Accuracy Roll is unsuccessful, deal 5 Dice of Damage to the User.'
  ),
  (
    'Ice Ball',
    'Successive Actions. Add 1 Extra Dice to the Damage Roll of',
    'Successive Actions. Add 1 Extra Dice to the Damage Roll of the last Ice Ball hit the user performs. If the Pokémon used Defense Curl this Round, add 1 Extra Dice to the Damage Roll of every hit.'
  ),
  (
    'Payback',
    'Add 2 Extra Dice to',
    'Add 2 Extra Dice to the Damage Pool if the target already damaged you this Round.'
  ),
  (
    'Sacred Sword',
    'Ignore any Increases to',
    'Ignore any Increases to the foe''s Defense.'
  ),
  (
    'Sheer Cold',
    'Deal Damage equal to',
    'Deal Damage equal to the Target''s Remaining HP, plus 1 Lethal Damage.'
  ),
  (
    'Stomping Tantrum',
    'Add 2 Extra Dice to',
    'Add 2 Extra Dice to the Damage Pool of this move if the User failed the Accuracy Roll of the last Move it performed.'
  ),
  (
    'Toxic Spikes',
    'Entry Hazard. Pokémon who enter the battle from',
    'Entry Hazard. Pokémon who enter the battle from the foe’s side of the field become Poisoned. Roll 1 Chance Dice for them to become Badly Poisoned instead.'
  ),
  (
    'Baton Pass',
    'Switcher Move. User switches out with another Pok' || chr(233) || 'mon. Any Attribute increase on the user is passed on the next Pok' || chr(233) || 'mon. The user can’t increase its Attributes again until',
    'Switcher Move. User switches out with another Pok' || chr(233) || 'mon. Any Attribute increase on the user is passed on the next Pok' || chr(233) || 'mon. The user can’t increase its Attributes again until the end of the scene.'
  ),
  (
    'Bulldoze',
    'Area Attack. Reduce',
    'Area Attack. Reduce the Dexterity of those affected.'
  ),
  (
    'Fire Pledge',
    'All flammable plants and objects in the battlefield are covered in flames. Roll 1 Dice of Fire Damage at',
    'All flammable plants and objects in the battlefield are covered in flames. Roll 1 Dice of Fire Damage at the end of every Round against everyone on the field.'
  ),
  (
    'Hex',
    'If the Target is affected by a Status Ailment add 2 Extra Dice to',
    'If the Target is affected by a Status Ailment add 2 Extra Dice to the Damage Pool.'
  ),
  (
    'Hidden Power',
    'The Power and Type of',
    'The Power and Type of this Move is decided by the Storyteller.'
  ),
  (
    'Ingrain',
    'If successful, spend 1 Will point to activate. User heals 1 HP at',
    'If successful, spend 1 Will point to activate. User heals 1 HP at the end of each Round. The User is now Blocked.'
  ),
  (
    'Snarl',
    'Sound Based. Reduce',
    'Sound Based. Reduce the foe''s Special.'
  ),
  (
    'Spirit Break',
    'If successful, reduce',
    'If successful, reduce the Foe''s Special.'
  ),
  (
    'Fling',
    'Ranged. Add up to 4 Dice to the Damage Pool, depending on',
    'Ranged. Add up to 4 Dice to the Damage Pool, depending on the held item thrown.'
  ),
  (
    'Follow Me',
    'Until the End of the Round, all of the foe’s Moves will target',
    'Until the End of the Round, all of the foe’s Moves will target the user.'
  ),
  (
    'Future Sight',
    'Strikes at the end of',
    'Strikes at the end of the next Round. It bypasses any Shield Move and cover. If the target retires or switches out from battle, the damage will be dealt to the next opponent or to one of its allies.'
  ),
  (
    'Hypnosis',
    'Put the target to sleep. Dark-Type Pokémon are affected by',
    'Put the target to sleep. Dark-Type Pokémon are affected by this move.'
  ),
  (
    'Mimic',
    'Copies the last move',
    'Copies the last move the target used until the end of the scene. That move replaces Mimic.'
  ),
  (
    'Mirror Coat',
    'This move only works if the foe just used a Special Attack. Roll',
    'This move only works if the foe just used a Special Attack. Roll the same Damage Pool as your foe’s last attack and add 2 Extra Damage Dice.'
  ),
  (
    'Mist',
    'For the next 4 Rounds,',
    'Increase one Ally’s Defense and Sp. Defense.'
  ),
  (
    'Misty Terrain',
    'Creatures standing on',
    'Creatures standing on the battlefield won’t be affected by Status Ailments. Dragon Type attacks won’t add their Power to the Damage Pool. Lasts 4 Rounds.'
  ),
  (
    'Pay Day',
    'Ranged. At the end of',
    'Ranged. At the end of the battle give Money to the Trainer Equal to its Rank: Starter/Beginner - $20.00 Amateur - $50.00 Ace - $75.00 Pro - $100.00.'
  ),
  (
    'Psych Up',
    'Copy the Target'' Modifiers and keep them until the end of',
    'Copy the Target’s Modifiers and keep them until the end of the scene.'
  ),
  (
    'Roar of Time',
    'Lethal. If successful,',
    'Lethal. If successful, the target can’t have any action until next Round.'
  ),
  (
    'Venoshock',
    'If the Foe is already poisoned, add 2 Extra Dice to the Damage',
    'If the Foe is already poisoned, add 2 Extra Dice to the Damage Pool.'
  ),
  (
    'Weather Ball',
    'If there is a weather condition on the field, add 2 Extra Dice to',
    'If there is a weather condition on the field, add 2 Extra Dice to the Damage Pool. This Move’s type will change according to the Weather: Sun/Fire, Rain/Water, Hail/Ice, Sand/Rock, Wind/Flying.'
  ),
  (
    'Yawn',
    'If the foe is not removed from battle at the beginning of',
    'If the foe is not removed from battle at the beginning of the next Round, it will fall asleep.'
  ),
  (
    'Metal Sound',
    'Sound Based. Reduce',
    'Sound Based. Reduce the foe’s Special Defense.'
  ),
  (
    'Reflect',
    'User and Allies will receive 1 less Damage from Physical Attacks. Lasts 4 Rounds. Damage',
    'User and Allies will receive 1 less Damage from Physical Attacks. Lasts 4 Rounds.'
  ),
  (
    'Retaliate',
    'If an Ally fainted in this or the previous Round, add 3 Extra Dice to',
    'If an Ally fainted in this or the previous Round, add 3 Extra Dice to the Damage pool. This effect can only be used once per Ally.'
  ),
  (
    'Rollout',
    'Successive Actions. Add 1 Extra Dice to the Damage Roll of',
    'Successive Actions. Add 1 Extra Dice to the Damage Roll of the last Rollout hit the user performs. If the Pokémon used Defense Curl this Round, add 1 Extra Dice to the Damage Roll of every hit.'
  ),
  (
    'Shore Up',
    'Basic Heal. If performed under Sandstorm weather,',
    'Basic Heal. If performed under Sandstorm weather, this Move is a Complete Heal.'
  ),
  (
    'Synthesis',
    'Basic Heal. If successful, spend 1 Will point to activate. If Sunny Weather is on effect, this Move becomes a Complete Heal. If Rain/Sandstorm Weather is in effect,',
    'Basic Heal. If successful, spend 1 Will point to activate. If Sunny Weather is on effect, this Move becomes a Complete Heal. If Rain/Sandstorm Weather is in effect, this Move only heals 1 HP.'
  )
) AS fixes(move_name, truncated_effect, corrected_effect)
WHERE lower(trim(m.name)) = lower(fixes.move_name)
  AND m.effect = fixes.truncated_effect;
