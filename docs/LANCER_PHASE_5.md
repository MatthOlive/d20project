# LANCER Phase 5 - Automated Combat

This phase adds the first server-authoritative combat loop for LANCER without changing Pokemon or T20 behavior.

## Delivered

- Combat sessions linked to the active hex map.
- Player and hostile participant sides with alternating activations.
- Two quick actions or one full action, standard move, reaction and overcharge state.
- Duplicate-action prevention during the same activation.
- Range and line-of-sight target validation on the map.
- Accuracy and difficulty cancellation, d20 attack roll, defense comparison and critical hits.
- Kinetic, energy, explosive, burn and heat damage components.
- Armor, AP, resistance, immunity, exposed and shredded handling.
- Structure and stress carryover with generated check results.
- Atomic attack transaction with optimistic entity revisions.
- Realtime combat sessions, participants, entity resources and combat cards.
- Combat Manager, attack preview and compact combat log inside the map workspace.

## Database

Run the migrations in this order:

1. `supabase/migrations/20260822120000_lancer_foundation.sql`
2. `supabase/migrations/20260822133000_lancer_content_character_engine.sql`
3. `supabase/migrations/20260822150000_lancer_hex_map_engine.sql`
4. `supabase/migrations/20260822170000_lancer_automated_combat.sql`

If the Phase 5 migration is not installed, the hex map remains usable and displays a combat-specific warning.

## Current Boundary

The initial combat loop covers attacks and direct resource changes. Manual confirmation, optional effects, frequencies, advanced equipment state and cover-aware targeting are extended by Phase 6. Complete structure/stress consequence choices and specialized reactions remain data-driven follow-up work.

## Verification

The deterministic rule checks live in `scripts/check-lancer-combat-engine.ts`.
