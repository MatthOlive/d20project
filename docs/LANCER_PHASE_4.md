# LANCER Phase 4 - Hex Map Engine

This phase adds an authoritative pointy-top hex map without changing Pokemon or T20 behavior.

## Delivered

- Axial/cube hex coordinates with pixel conversion and rounding.
- Distance, line, ring, blast, burst, line and cone helpers.
- A* pathfinding with terrain costs, obstructions and occupied hexes.
- Reachable-area calculation based on canonical entity speed.
- Basic line of sight through terrain marked as LOS blocking.
- Canvas renderer with pan, cursor-centered zoom and stable map dimensions.
- Entity-linked tokens. Position is stored on the token; combat state remains on `lancer_entities`.
- GM terrain painter for normal, difficult, dangerous, obstruction, cover and custom hexes.
- Range/LOS measuring mode.
- Realtime token and terrain synchronization.
- Server-authoritative token placement and movement RPCs with revision checks.

## Database

Run `supabase/migrations/20260822150000_lancer_hex_map_engine.sql` after the Phase 1 and Phase 2/3 migrations.

The migration creates one default active map for every existing LANCER campaign and automatically creates one for new campaigns.

## Verification

The standalone rule checks live in `scripts/check-lancer-hex-engine.ts`.
