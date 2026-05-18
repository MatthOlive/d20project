# Pokérole 2.0 VTT — v1 Plan

Per your dev note, the **Pokémon sheet database and logic** is the priority. v1 ships the data engine, auth, game rooms, realtime chat + dice. Other sections are scaffolded with empty/placeholder UI so the app feels complete and we expand in follow-ups.

## What you'll get in v1

1. **Auth** — email/password + Google sign-in (Lovable Cloud).
2. **Dashboard** — list your games, "Create New Game" (you become Narrator), join via invite link.
3. **Game room** — Narrator-uploaded background image, three tabs: Chat & Dice, Compendium (UI shell), Files & Sheets (basic).
4. **Chat & Dice** — realtime chat, `/roll 6d10` syntax, successes (≥6) highlighted green, botches (1s) tracked.
5. **Pokémon sheet engine** — the centerpiece. Species dropdown auto-fills type/abilities/base attributes/species limits; dot editor enforces species cap; rank filter (Pokéball icons) on learnable moves; hard `Insight + 2` move cap with alert; type-colored move cards with "Roll" button that posts `(Accuracy + Attribute)` to chat.
6. **Trainer sheet** — attributes (cap 5), derived HP/Will, skills, moves (cap `Insight + 2`), personal Pokédex checklist.
7. **Floating windows** — sheets, compendium entries, and a basic Initiative Tracker open as draggable floating panels.

## Deferred to v2 (scaffolded only)

- Compendium content (UI ready; you'll upload rules text later).
- Files & Sheets folder permissions per-user (basic upload/list ships, granular perms later).
- Condition toggles with mechanical penalty automation.
- Status effect visual indicators on sheets.

## Pokérole 2.0 PDF ingest

You mentioned importing the Pokérole 2.0 PDF. **Please upload the PDF in your next message** and I'll run a one-time parser (skill/pdf) to extract into seed data:

- `species` (name, types, base attributes, species attribute limits, abilities, rank-keyed learnable moves)
- `moves` (name, type, power, accuracy stat, damage stat, effect, target)
- `abilities` (name, effect)

I'll review the parse for accuracy before seeding the DB. If parsing misses fields (PDFs are messy), I'll flag gaps and we can patch them.

## Technical details

**Stack:** TanStack Start + Lovable Cloud (Supabase). Realtime via Supabase Realtime channels for chat, dice rolls, initiative.

**Schema (high level):**
```text
profiles(id, display_name, avatar_url)
games(id, narrator_id, name, background_url, invite_code, created_at)
game_members(game_id, user_id, role)           -- role: narrator | player
chat_messages(id, game_id, user_id, kind, body, roll_data jsonb, created_at)
species(id, name, types[], base_attrs jsonb, attr_limits jsonb, abilities[])
species_moves(species_id, move_id, min_rank)   -- rank: starter|beginner|amateur|ace|pro|master
moves(id, name, type, power, accuracy_stat, damage_stat, effect, target)
abilities(id, name, effect)
trainers(id, game_id, owner_id, name, nature, age, concept, rank, attrs jsonb, skills jsonb, pokedex jsonb)
trainer_moves(trainer_id, move_id)
pokemon(id, game_id, owner_id, species_id, nickname, rank, current_attrs jsonb, modifiers jsonb, hp, will, status[])
pokemon_moves(pokemon_id, move_id)
files(id, game_id, owner_id, parent_id, name, kind, storage_path, perms jsonb)
initiative(game_id, character_ref, successes, position)
```

RLS: members can read game-scoped rows; only Narrator can mutate game settings/uploads; owners control their own sheets unless Narrator overrides.

**Move cap enforcement:** DB trigger + client-side guard so adding a move past `Insight + 2` rejects with the alert.

**Dice roller:** server function rolls cryptographically, returns `{dice:[…], successes, botches}`, broadcast via Realtime. UI renders dice with green for ≥6.

**Floating windows:** lightweight draggable wrapper around shadcn `Dialog`/`Card` with `react-rnd` or a small custom hook (no heavy deps).

**Theme:** white / light-gray / vibrant Pokédex red, semantic tokens in `src/styles.css`. Type-colored move cards use a `--type-fire`, `--type-water`, … token map.

## Build order

1. Enable Lovable Cloud, auth + dashboard + create/join game.
2. Parse uploaded PDF → seed `species` / `moves` / `abilities`.
3. Pokémon sheet engine (the core — species auto-fill, rank filter, move cap, roll-to-chat).
4. Realtime chat + D10 roller wired to sheet "Roll" buttons.
5. Trainer sheet.
6. Floating-window framework + basic Initiative Tracker.
7. Compendium + Files UI shells.

**Next step from you:** upload the Pokérole 2.0 PDF so step 2 can land in the first build.