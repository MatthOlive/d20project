import {
  applyLancerEffects,
  availableLancerReactions,
  canUseLancerFrequency,
  prepareLancerActionUse,
  resolveLancerTriggers,
} from "../src/lib/lancer/advanced-combat-engine.ts";
import { analyzeHexLineOfSight, hexKey, type LancerHexCell } from "../src/lib/lancer/hex-engine.ts";
import { createActionEconomyState } from "../src/lib/lancer/combat-engine.ts";
import { createInitialLancerState } from "../src/lib/lancer/rules-engine.ts";
import type { LancerGameActionDefinition, LancerTriggerDefinition } from "../src/lib/lancer/types.ts";

let assertions = 0;
function check(condition: unknown, message: string): void {
  assertions += 1;
  if (!condition) throw new Error(message);
}

const context = { turnId: "t1", roundId: "r1", sceneId: "s1", missionId: "m1" };
const loadingAction: LancerGameActionDefinition = {
  id: "cannon-fire",
  sourceId: "heavy-cannon",
  name: "Heavy Cannon",
  activation: "quick",
  attackType: "ranged",
  targetType: "character",
  range: [{ type: "range", value: 10 }],
  roll: "1d20",
  damage: [{ type: "kinetic", expression: "1d6" }],
  effects: [{ tags: ["loading"] }],
  resourceCosts: { uses: 1, heat: 2 },
  triggers: [],
  frequency: "round",
};
const state = createInitialLancerState("mech");
state.resources.hp = { current: 10, max: 10 };
state.equipment.push({
  instanceId: "heavy-cannon",
  compendiumItemId: "item-cannon",
  sourceType: "core",
  name: "Heavy Cannon",
  state: { loaded: true, uses: 2 },
});
const prepared = prepareLancerActionUse({ state, action: loadingAction, frequencyContext: context, compendiumItemId: "item-cannon" });
check(prepared.allowed, "loaded equipment can act");
check(prepared.heatCost === 2, "heat cost is separated for stress resolution");
check(prepared.nextState.equipment[0]?.state.uses === 1, "limited use is consumed");
check(prepared.nextState.equipment[0]?.state.loaded === false, "loading weapon becomes unloaded");
check(!canUseLancerFrequency(prepared.nextState, loadingAction, context), "round frequency is tracked");
check(!prepareLancerActionUse({ state: prepared.nextState, action: loadingAction, frequencyContext: context }).allowed, "repeated frequency is rejected");

const effected = applyLancerEffects(state, [
  { kind: "condition", id: "impaired", name: "Impaired", duration: "round" },
  { kind: "resource", resource: "hp", value: -2 },
], "test-action");
check(effected.nextState.conditions.some((entry) => entry.id === "impaired"), "condition effect is automated");
check(effected.nextState.resources.hp?.current === Math.max(0, (state.resources.hp?.current ?? 0) - 2), "resource effect is automated");

const trigger: LancerTriggerDefinition = {
  id: "on-hit",
  event: "attack_hit",
  optional: true,
  effects: [{ id: "impaired", kind: "custom", condition: null }],
};
const triggerResult = resolveLancerTriggers([trigger], { type: "attack_hit", actorEntityId: "a", targetEntityIds: ["b"], payload: {} });
check(triggerResult.matched.length === 1 && triggerResult.optionalEffects.length === 1, "trigger resolver separates optional effects");

const reaction: LancerGameActionDefinition = { ...loadingAction, id: "brace", activation: "reaction", frequency: "turn", triggers: ["attack_declared"], resourceCosts: {}, effects: [] };
check(availableLancerReactions({ actions: [reaction], state, event: { type: "attack_declared", actorEntityId: "a", targetEntityIds: ["b"], payload: {} }, frequencyContext: context, reactionAvailable: createActionEconomyState().reactionAvailable }).length === 1, "matching reaction is offered");

const cells = new Map<string, LancerHexCell>();
cells.set(hexKey({ q: 1, r: 0 }), { q: 1, r: 0, terrainType: "cover", movementCost: 1, blocksMovement: false, blocksLos: false, cover: 2 });
const covered = analyzeHexLineOfSight({ q: 0, r: 0 }, { q: 2, r: 0 }, cells);
check(covered.hasLineOfSight && covered.cover === 2 && covered.difficulty === 1, "cover adds difficulty without blocking LOS");
cells.set(hexKey({ q: 1, r: 0 }), { q: 1, r: 0, terrainType: "obstruction", movementCost: 1, blocksMovement: true, blocksLos: true, cover: 2 });
check(!analyzeHexLineOfSight({ q: 0, r: 0 }, { q: 2, r: 0 }, cells).hasLineOfSight, "obstruction blocks advanced LOS");

console.log(`LANCER advanced combat checks: ${assertions} assertions passed`);
