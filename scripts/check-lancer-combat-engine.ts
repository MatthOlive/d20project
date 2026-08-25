import {
  createActionEconomyState,
  overchargeHeatExpression,
  resolveLancerAttack,
  resolveLancerDamage,
  spendLancerAction,
} from "../src/lib/lancer/combat-engine.ts";
import { createInitialLancerState } from "../src/lib/lancer/rules-engine.ts";
import type { LancerGameActionDefinition } from "../src/lib/lancer/types.ts";

let assertions = 0;
function check(condition: unknown, message: string): void {
  assertions += 1;
  if (!condition) throw new Error(message);
}

function randomSequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

const weapon: LancerGameActionDefinition = {
  id: "weapon-test",
  sourceId: "weapon-test",
  name: "Test Cannon",
  activation: "quick",
  attackType: "ranged",
  targetType: "character",
  range: [{ type: "range", value: 10 }],
  roll: "1d20",
  damage: [{ type: "Kinetic", expression: "2d6+4" }],
  effects: [],
  resourceCosts: {},
  triggers: [],
};
const source = createInitialLancerState("mech");
source.stats.grit = 2;
const target = createInitialLancerState("mech");
target.stats.evasion = 10;
target.stats.armor = 2;
target.resources.hp = { current: 15, max: 15 };

const hit = resolveLancerAttack({
  action: weapon,
  source,
  target,
  sourceEntityId: "source",
  targetEntityId: "target",
  sourceName: "Everest",
  targetName: "Assault",
  distance: 5,
  hasLineOfSight: true,
  random: randomSequence([0.65, 0.7, 0.3]),
});
check(hit.result.outcome === "hit", "attack hits target defense");
check(hit.result.damage?.totalHpDamage === 9, "armor applies after 2d6+4");
check(hit.result.damage?.nextState.resources.hp?.current === 6, "damage updates canonical HP");

const crit = resolveLancerAttack({
  action: weapon,
  source,
  target,
  sourceEntityId: "source",
  targetEntityId: "target",
  sourceName: "Everest",
  targetName: "Assault",
  distance: 5,
  hasLineOfSight: true,
  random: randomSequence([0.99, 0, 0, 0.1, 0.2, 0.8, 0.9]),
});
check(crit.result.outcome === "critical", "20+ is critical");
check((crit.result.damage?.components[0]?.criticalDice?.[0]?.rolled.length ?? 0) === 4, "critical rolls damage dice twice");

const resistant = structuredClone(target);
resistant.metadata.resistances = ["kinetic"];
const reduced = resolveLancerDamage({ action: weapon, target: resistant, critical: false, random: randomSequence([0.8, 0.8]) });
check(reduced.totalHpDamage === 6, "resistance halves after armor and rounds up");

const structureTarget = structuredClone(target);
structureTarget.resources.hp = { current: 5, max: 15 };
const heavy = { ...weapon, damage: [{ type: "Kinetic", expression: "20" }] };
const structured = resolveLancerDamage({ action: heavy, target: structureTarget, critical: false, random: randomSequence([0.9]) });
check(structured.nextState.resources.structure?.current === 3, "reaching zero HP loses structure");
check(structured.nextState.resources.hp?.current === 2, "excess damage carries after HP reset");
check(structured.structureChecks.length === 1, "structure check generated");

const heatTarget = structuredClone(target);
heatTarget.resources.heat = { current: 5, max: 6 };
const heatAction = { ...weapon, damage: [{ type: "Heat", expression: "3" }] };
const heated = resolveLancerDamage({ action: heatAction, target: heatTarget, critical: false, random: randomSequence([0.9]) });
check(heated.nextState.resources.stress?.current === 3, "heat over cap loses stress");
check(heated.nextState.resources.heat?.current === 1, "excess heat carries after stress");

let economy = createActionEconomyState();
const first = spendLancerAction(economy, weapon);
check(first.allowed && first.next.quickActionsRemaining === 1, "quick action spends one slot");
economy = first.next;
check(!spendLancerAction(economy, weapon).allowed, "duplicate action blocked");
check(overchargeHeatExpression(0) === "1" && overchargeHeatExpression(3) === "1d6+4", "overcharge progression");

console.log(`LANCER combat checks: ${assertions} assertions passed`);
