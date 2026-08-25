# LANCER - Phases 2 and 3

## Content engine

Campaign GMs can import `.lcp` archives through the Content Manager. The client validates archive size, `manifest.json`, package identity, version, JSON files, item limits, and recognized categories before sending normalized data to the database.

The import RPC replaces a previous version of the same campaign package atomically. Disabling a pack removes its items from builders without deleting saved package data. Deleting a pack cascades only through content imported from that pack.

Compendium records preserve:

- external and internal identity;
- item category and complete source data;
- package/source metadata;
- normalized actions;
- structured effects;
- trigger definitions.

`CompConAdapter` is the boundary for compatible external data. Database code does not depend directly on a COMP/CON file shape.

## Automated character engine

Pilot and mech editors operate on `LancerBuildState`. Saving calls the build engine, which validates the build, derives canonical state, and persists state plus build in one transaction.

Current automatic calculations include:

- Grit from License Level;
- pilot HP from base HP and Grit;
- mech HP, Repair Cap, Evasion, Speed, E-Defense, Tech Attack, Heat Cap and limited bonus from frame/HASE;
- Save Target and System Points from frame/Grit/HASE;
- resource maximum updates while preserving damage already taken;
- equipment, action and reaction references from selected compendium items;
- inspectable stat breakdowns.

Validation currently covers HASE point limits, skill bounds, talent/license/core-bonus rank budgets, frame availability, System Points and basic mount capacity. Exact license unlock graphs and full mount compatibility remain for a later Phase 3 refinement after real LCP fixtures are available.

Pilot Trigger and HASE checks are functional and record structured dice events. Attacks are intentionally not exposed yet because target/range/damage resolution belongs to the automated combat phase.

## Database migration

Run `20260822133000_lancer_content_character_engine.sql` after the Phase 1 migration. It creates campaign content packs, compendium items, favorites, LCP import, atomic build commits, structured roll recording, RLS and realtime publication.

## Current boundary

The implementation does not bundle protected LANCER compendium content. Campaigns become populated by user-imported LCP files or future authorized core data. The next phase is the axial hex map and entity-token integration.
