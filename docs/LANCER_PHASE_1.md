# LANCER - Phase 1 Foundation

## Scope

This phase adds the architectural foundation for LANCER without presenting incomplete combat controls as finished features. Existing authentication, campaigns, membership, invitations, chat, and realtime infrastructure are reused.

## Data flow

```text
UI
  -> Game action
  -> LancerRulesEngine
  -> Canonical entity state
  -> Atomic state transaction
  -> Game events
  -> Supabase Realtime
  -> Every subscribed interface
```

## Canonical entity

`lancer_entities` is the single source of truth for a pilot, mech, NPC, object, or deployable. Runtime state is stored in `current_state`, while build choices and validation live in `build_state`. Both documents are versioned and validated.

Tokens are intentionally not part of this phase. The future hex map will reference an entity instead of copying HP, Heat, Structure, Stress, conditions, or equipment state.

## Game state and events

- `lancer_campaigns` stores campaign-level rule and automation settings.
- `lancer_entities` stores canonical entities with optimistic revision numbers.
- `lancer_entity_permissions` grants view, edit, and control access per user.
- `lancer_combat_transactions` stores atomic before/after snapshots for future undo.
- `lancer_game_events` stores structured chronological events for realtime interfaces and the future Combat Log.

## Rules engine contracts

The TypeScript domain defines:

- canonical entity and build state;
- inspectable derived-value breakdowns;
- data-driven action definitions;
- structured resolutions, state changes, and generated events;
- resolver contracts for effects, builds, and actions;
- dice expressions and LANCER Accuracy/Difficulty cancellation.

The current implementation includes deterministic dice primitives and initial canonical states. Attack, damage, Heat, Structure, Stress, Tech, reactions, movement, and effects remain unavailable until their resolvers are implemented and tested against the rules.

## Security

RLS limits campaign data to members. Players control only owned or explicitly shared entities. The GM retains campaign-wide control. State writes go through a revision-checked security-definer RPC that persists state, transaction, and events together.

## Next phase

Phase 2 adds the content engine: Compendium records, LCP validation/import, source tracking, `GameActionDefinition` persistence, effect/trigger definitions, and the Comp/Con adapter boundary.

