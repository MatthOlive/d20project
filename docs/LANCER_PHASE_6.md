# LANCER Phase 6 - Advanced Combat

This phase extends the automated combat transaction while preserving the canonical entity state.

## Delivered

- Trigger resolver with mandatory and optional effect separation.
- Reaction eligibility based on trigger, reaction availability and frequency.
- Turn, round, scene and mission frequency tracking.
- Loading, disabled, destroyed, limited-use and charge-aware equipment actions.
- Action resource consumption and heat costs in the source entity state.
- Automated conditions, statuses, resource changes, stat bonuses and equipment state effects.
- Advanced line-of-sight analysis with automatic cover Difficulty for non-tech attacks.
- Source and target state updates in the same optimistic transaction.
- Pending decisions for manual damage and optional effects.
- Realtime pending-decision panel with Apply and Reject commands for the target controller or GM.

## Database

Run `supabase/migrations/20260822183000_lancer_advanced_combat.sql` after the Phase 5 migration.

The migration replaces the Phase 5 attack RPC with the extended source-and-target transaction and creates `lancer_pending_combat_effects`.

## Verification

The standalone checks live in `scripts/check-lancer-advanced-combat-engine.ts`.
