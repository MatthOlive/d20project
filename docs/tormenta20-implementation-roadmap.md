# Tormenta20 implementation roadmap

This roadmap compares the current D20 Project implementation with the supplied
Tormenta20 2nd Edition - Jogo do Ano corebook. It is a staged engineering plan,
not a claim that every rule is automated. Rules text should be represented as
concise mechanics and links/notes, not copied wholesale into the application.

## Already present

- Games can select Tormenta20 as their rules system.
- T20 characters have a database-backed sheet with race, class, origin, deity,
  level, XP, six attributes, skill bonuses, HP, MP, Defense, speed, attacks,
  powers, spells, inventory, notes, and sharing permissions.
- T20 characters can be placed on the shared map as tokens. The map exposes
  HP/MP and quick-roll actions, and token actions can open the character sheet.
- The app rolls d20 plus a modifier, posts results to chat, and recognizes
  initiative rolls for the encounter order.
- Per-character powers and spells can be linked from catalogs; simple catalogs
  and free-text notes already exist.
- T20 has a basic narrator prompt and rule-reference panel.

## Important gaps before T20 is end-to-end playable

1. Character creation and advancement: class training and class-based PV/PM
   baselines can now be applied explicitly. Race benefits, starting gear,
   class abilities, powers, prerequisites, multiclassing, and level-up benefits
   are not yet derived.
2. Skills: new sheets can use Corebook-derived trained checks, class-specific
   level-1 training choices, the quick-rule origin skill choices, trained-only
   restrictions, and armor penalties. Power-granted training, multiclassing,
   and level-up choices remain.
3. Combat: an initial structured weapon attack can compare against a T20 target's
   Defense and the narrator can confirm damage application. Spells remain
   free-text/basic rolls; there is no complete action economy, range/target
   handling, damage type/resistance prompt, save/DC resolution, or turn-state
   enforcement.
4. Resources and effects: powers/spells have basic catalog fields, but costs,
   activation, target selection, conditions, durations, and resource spending
   are not generally resolved by the game engine.
5. Equipment and defenses: the Corebook armor/shield list now calculates the
   listed Defense bonuses, heavy-armor Dexterity rule, and combined skill
   penalty. Structured custom inventory now tracks spaces, coins, capacity,
   overloading, and the Adventurer's Backpack. Full catalog import, proficiency,
   contextual swimming checks, and situational bonuses remain.
6. Conditions and recovery: the T20 sheet/map do not yet provide full condition
   tracking, duration/expiry, rest recovery, dying/stabilization, or temporary
   HP/MP handling.
7. Adversaries: there is not yet a streamlined T20 monster/NPC builder and
   encounter library comparable to the corebook's simplified threat profiles.

## Work started in this increment

- Extended the PokéRole catalog audit to scan all 597 imported move names for
  suspicious truncated endings and assert that every flagged entry has a
  guarded Corebook correction. The scan flags 34 entries; it caught Toxic
  Spikes missing from the earlier repair list, now corrected from the supplied
  Corebook.
- Added opt-in, rules-derived skill checks: floor(level / 2) + key attribute +
  the level-based training bonus (+2 at levels 1-6, +4 at 7-14, +6 at 15-20).
- Added trained-only checks based on the corebook skill table.
- Added armor penalties for Acrobacia, Furtividade, and Ladinagem in rules mode.
- New T20 characters start in rules mode. Existing characters remain in manual
  mode with their stored bonuses intact until an editor opts into rules mode.
- Training marks are stored separately so switching modes never overwrites
  legacy skill values.
- Added automated tests for the calculation, level breakpoints, trained-only
  rules, armor penalties, and preservation of manual modifiers.
- Added level-1 required and selectable skill training for all 14 core classes;
  choices are stored separately from origin/power training and validated against
  each class's fixed skills, required alternatives, and choice count.
- Added all 35 Corebook origins' skill benefit lists and the optional quick-rule
  flow to choose two skills from the selected origin. Amnésico retains its
  Storyteller-selected exception and is not incorrectly treated as two fixed
  origin skills.
- Kept old/manual training fields and rolls intact; class training is additive.
- Added explicit class baseline calculation for maximum PV/PM and unarmored
  Defense. First application initializes a new character's current PV/PM; later
  recalculations preserve current resources and do not overwrite Defense.
- Existing sheets are marked initialized by migration so applying the feature
  cannot refill legacy/current resources or replace their manual Defense.
- Added the Corebook's 10 armor and 2 shield entries to the structured sheet;
  selecting one applies its Defense and cumulative armor penalty. Heavy armor
  excludes Dexterity from the base Defense calculation and consumes the listed
  load spaces. Existing sheets keep their values until rules are deliberately
  enabled; after opt-in, Dexterity changes recalculate Defense.
- Added an additive structured-inventory list and coin total, carrying-space
  calculation from Strength, two-space Adventurer's Backpack, overloaded
  penalties/slowdown, and the book's double-capacity ceiling. Existing free-text
  inventory is preserved and excluded until players move items into the
  structured list deliberately. Armor/shield and structured weapons count
  toward spaces; older weapons without a stored space value prompt manual entry.
- Added an initial structured weapon list per character with Luta/Pontaria,
  attack bonus, damage dice/modifier, and an explicit Strength-to-damage toggle.
- Weapon attacks roll d20 plus the resolved skill modifier; damage is kept
  separate from the attack roll and is only applied after narrator confirmation.
- Weapon attacks can target another T20 character on the same table; the shared
  database RPC rolls the d20, reads that character's current Defense, compares
  the attack total with it, and publishes hit/miss plus the weapon's damage
  expression. Only the attacker owner or narrator may roll for that character.
- This is deliberately not a full combat workflow: damage remains a separate
  roll; the narrator now gets an explicit confirmation action in chat, with a
  transactional RPC that locks current target PV and records one resolution per
  attack. Replays of the same attack are rejected. Damage types/resistances,
  action economy, and deriving the attack modifier from weapon/skill rules inside
  the database remain open.

## Recommended next slices

1. Finish skill fidelity: power-granted training, multiclassing, and level-up
   training choices.
2. Character builder: race benefits, starting equipment, class powers and
   prerequisites, advancement, and full Defense with equipment.
3. Finish structured combat: range, action type, spells, save/DC, and damage
   types/resistances. The initial narrator-confirmed HP application path is now
   present for structured weapon attacks.
4. Combat state: initiative, turn/action counters, conditions and durations,
   damage/healing, and rest/recovery.
5. GM tools: compact NPC/monster sheets, encounter composition, and reusable
   adversary templates.

Corebook-specific rules and table values need review before each slice ships.
The implemented slices cover trained-skill checks and a deliberately narrow
weapon attack flow; neither is a complete T20 rules engine.
