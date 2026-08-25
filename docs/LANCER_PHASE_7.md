# LANCER Phase 7 - GM and Encounters

## Delivered

- NPC Builder with class, tier, templates, optional features and a canonical-state preview.
- Reusable NPC blueprints and instant NPC instances for map placement.
- Encounter Builder with map, sitrep, objectives, victory/defeat rules, round and score limits.
- Enemy roster, reserves, round-based reinforcements and deployment hexes.
- Atomic encounter startup that snapshots the template, spawns NPCs, places tokens and opens combat.
- GM Tools for HP/heat/resource changes, conditions, token visibility and round control.
- Audited manual overrides with reason, actor, timestamp, previous state and next state.
- Safe Undo for canonical entity transactions and attack transactions.
- Encounter outcomes with victory, defeat and neutral completion.
- RLS and Realtime coverage for Phase 7 data.

## Database

Apply `supabase/migrations/20260822200000_lancer_gm_encounters.sql` after the previous LANCER migrations.

The migration is additive. It does not change Pokemon or T20 tables.

## Validation

The deterministic checks are in `scripts/check-lancer-gm-engine.ts` and cover NPC tier composition, template effects, deployment parsing and objective outcomes.
