import {
  applyLancerEffects,
  partitionLancerActionEffects,
  prepareLancerActionUse,
  type LancerFrequencyContext,
} from "@/lib/lancer/advanced-combat-engine";
import {
  resolveAccuracyDifficulty,
  rollDiceExpression,
  type AccuracyDifficultyResult,
  type DiceExpressionResult,
  type RandomSource,
} from "@/lib/lancer/rules-engine";
import type {
  LancerCanonicalState,
  LancerGameActionDefinition,
  LancerResolution,
} from "@/lib/lancer/types";

export type LancerDamageType = "kinetic" | "energy" | "explosive" | "burn" | "heat" | "variable";

export type LancerDamageComponent = {
  type: LancerDamageType;
  expression: string;
  raw: number;
  armorApplied: number;
  resisted: boolean;
  exposed: boolean;
  final: number;
  roll: DiceExpressionResult;
  criticalDice?: { faces: number; rolled: number[]; kept: number[] }[];
};

export type LancerDamageResolution = {
  components: LancerDamageComponent[];
  totalHpDamage: number;
  totalHeat: number;
  nextState: LancerCanonicalState;
  structureChecks: LancerStructureCheck[];
  stressChecks: LancerStressCheck[];
  destroyed: boolean;
  meltdown: boolean;
};

export type LancerAttackRequest = {
  action: LancerGameActionDefinition;
  source: LancerCanonicalState;
  target: LancerCanonicalState;
  sourceEntityId: string;
  targetEntityId: string;
  sourceName: string;
  targetName: string;
  distance: number;
  hasLineOfSight: boolean;
  accuracy?: number;
  difficulty?: number;
  bonus?: number;
  targetDefense?: number;
  sourceCompendiumItemId?: string | null;
  frequencyContext?: LancerFrequencyContext;
  random?: RandomSource;
};

export type LancerAttackResult = {
  actionId: string;
  actionName: string;
  sourceEntityId: string;
  sourceName: string;
  targetEntityId: string;
  targetName: string;
  attackType: LancerGameActionDefinition["attackType"];
  distance: number;
  range: number;
  hasLineOfSight: boolean;
  die: number;
  bonus: number;
  accuracyDifficulty: AccuracyDifficultyResult;
  total: number;
  targetDefense: number;
  outcome: "miss" | "hit" | "critical";
  damage: LancerDamageResolution | null;
  sourceNextState: LancerCanonicalState;
  targetNextState: LancerCanonicalState;
  sourceStressChecks: LancerStressCheck[];
  appliedEffects: Record<string, unknown>[];
  optionalEffects: Record<string, unknown>[];
  unsupportedEffects: Record<string, unknown>[];
};

export type LancerStructureCheck = {
  dice: number[];
  lowest: number;
  ones: number;
  remainingStructure: number;
  outcome: "glancing_blow" | "system_trauma" | "direct_hit" | "crushing_hit" | "destroyed";
  requiresChoice: boolean;
};

export type LancerStressCheck = {
  dice: number[];
  lowest: number;
  ones: number;
  remainingStress: number;
  outcome: "emergency_shunt" | "destabilized_power_plant" | "reactor_meltdown" | "irreversible_meltdown";
  requiresCheck: boolean;
};

export type LancerActionEconomyState = {
  quickActionsRemaining: 0 | 1 | 2;
  standardMoveAvailable: boolean;
  reactionAvailable: boolean;
  overchargeAvailable: boolean;
  overchargeCount: number;
  usedActionIds: string[];
};

export type LancerActionEconomyResolution = {
  allowed: boolean;
  reason: string | null;
  next: LancerActionEconomyState;
};

function cloneState(state: LancerCanonicalState): LancerCanonicalState {
  return structuredClone(state);
}

function safeNumber(value: unknown, fallback = 0): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "_");
}

function hasStateMarker(state: LancerCanonicalState, marker: string): boolean {
  const expected = normalizeName(marker);
  return [...state.conditions, ...state.statuses].some((entry) => {
    return normalizeName(entry.id) === expected || normalizeName(entry.name) === expected;
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function damageType(value: string): LancerDamageType {
  const normalized = normalizeName(value);
  if (normalized.includes("kinetic")) return "kinetic";
  if (normalized.includes("energy")) return "energy";
  if (normalized.includes("explosive")) return "explosive";
  if (normalized.includes("burn")) return "burn";
  if (normalized.includes("heat")) return "heat";
  return "variable";
}

function actionHasTag(action: LancerGameActionDefinition, tag: string): boolean {
  const expected = normalizeName(tag);
  const metadata = action as LancerGameActionDefinition & { tags?: unknown; properties?: unknown };
  const values = [
    ...stringArray(metadata.tags),
    ...stringArray(metadata.properties),
    ...action.effects.flatMap((effect) => stringArray(effect.tags)),
  ];
  return values.some((value) => normalizeName(value) === expected || normalizeName(value).includes(expected));
}

function rollCriticalExpression(expression: string, random: RandomSource): {
  roll: DiceExpressionResult;
  criticalDice: { faces: number; rolled: number[]; kept: number[] }[];
} {
  const base = rollDiceExpression(expression, random);
  let total = base.modifier;
  const criticalDice = base.terms.map((term) => {
    const rolled = Array.from({ length: term.count * 2 }, () => Math.floor(random() * term.faces) + 1);
    const kept = [...rolled].sort((a, b) => b - a).slice(0, term.count);
    total += term.sign * kept.reduce((sum, value) => sum + value, 0);
    return { faces: term.faces, rolled, kept };
  });
  return { roll: { ...base, total }, criticalDice };
}

function rollStructureCheck(markedDamage: number, remainingStructure: number, random: RandomSource): LancerStructureCheck {
  const dice = Array.from({ length: Math.max(1, markedDamage) }, () => Math.floor(random() * 6) + 1);
  const lowest = Math.min(...dice);
  const ones = dice.filter((value) => value === 1).length;
  if (remainingStructure <= 0) {
    return { dice, lowest, ones, remainingStructure, outcome: "destroyed", requiresChoice: false };
  }
  if (ones >= 2) {
    return { dice, lowest, ones, remainingStructure, outcome: "crushing_hit", requiresChoice: false };
  }
  if (lowest >= 5) return { dice, lowest, ones, remainingStructure, outcome: "glancing_blow", requiresChoice: false };
  if (lowest >= 2) return { dice, lowest, ones, remainingStructure, outcome: "system_trauma", requiresChoice: true };
  return { dice, lowest, ones, remainingStructure, outcome: "direct_hit", requiresChoice: remainingStructure === 2 };
}

function rollStressCheck(markedDamage: number, remainingStress: number, random: RandomSource): LancerStressCheck {
  const dice = Array.from({ length: Math.max(1, markedDamage) }, () => Math.floor(random() * 6) + 1);
  const lowest = Math.min(...dice);
  const ones = dice.filter((value) => value === 1).length;
  if (ones >= 2) return { dice, lowest, ones, remainingStress, outcome: "irreversible_meltdown", requiresCheck: false };
  if (lowest >= 5) return { dice, lowest, ones, remainingStress, outcome: "emergency_shunt", requiresCheck: false };
  if (lowest >= 2) return { dice, lowest, ones, remainingStress, outcome: "destabilized_power_plant", requiresCheck: false };
  return { dice, lowest, ones, remainingStress, outcome: "reactor_meltdown", requiresCheck: remainingStress === 2 };
}

function applyHpDamage(
  state: LancerCanonicalState,
  incomingDamage: number,
  random: RandomSource,
): { next: LancerCanonicalState; checks: LancerStructureCheck[]; destroyed: boolean } {
  const next = cloneState(state);
  const hp = next.resources.hp;
  if (!hp || incomingDamage <= 0) return { next, checks: [], destroyed: false };
  const structure = next.resources.structure;
  if (!structure) {
    hp.current = Math.max(0, hp.current - incomingDamage);
    return { next, checks: [], destroyed: hp.current === 0 };
  }

  const checks: LancerStructureCheck[] = [];
  let remainingDamage = incomingDamage;
  while (remainingDamage > 0 && structure.current > 0) {
    if (remainingDamage < hp.current) {
      hp.current -= remainingDamage;
      remainingDamage = 0;
      break;
    }
    remainingDamage -= hp.current;
    structure.current -= 1;
    hp.current = hp.max;
    const marked = structure.max - structure.current;
    checks.push(rollStructureCheck(marked, structure.current, random));
    if (structure.current <= 0) break;
  }
  return { next, checks, destroyed: structure.current <= 0 };
}

function applyHeat(
  state: LancerCanonicalState,
  incomingHeat: number,
  random: RandomSource,
): { next: LancerCanonicalState; checks: LancerStressCheck[]; meltdown: boolean } {
  const next = cloneState(state);
  const heat = next.resources.heat;
  if (!heat || incomingHeat <= 0) return { next, checks: [], meltdown: false };
  const stress = next.resources.stress;
  if (!stress) {
    heat.current = Math.max(0, heat.current + incomingHeat);
    return { next, checks: [], meltdown: false };
  }

  const checks: LancerStressCheck[] = [];
  let total = heat.current + incomingHeat;
  while (total > heat.max && stress.current > 0) {
    const excess = Math.max(0, total - (heat.max + 1));
    stress.current -= 1;
    heat.current = 0;
    total = excess;
    const marked = stress.max - stress.current;
    checks.push(rollStressCheck(marked, stress.current, random));
  }
  heat.current = Math.max(0, total);
  return { next, checks, meltdown: stress.current <= 0 || checks.some((check) => check.outcome.includes("meltdown")) };
}

export function resolveLancerDamage({
  action,
  target,
  critical,
  random = Math.random,
}: {
  action: LancerGameActionDefinition;
  target: LancerCanonicalState;
  critical: boolean;
  random?: RandomSource;
}): LancerDamageResolution {
  const shredded = hasStateMarker(target, "shredded");
  const exposed = hasStateMarker(target, "exposed");
  const resistances = new Set(stringArray(target.metadata.resistances).map(normalizeName));
  const immunities = new Set(stringArray(target.metadata.immunities).map(normalizeName));
  const armor = shredded ? 0 : Math.max(0, safeNumber(target.stats.armor));
  const armorPiercing = actionHasTag(action, "ap") || actionHasTag(action, "armor_piercing");
  const components: LancerDamageComponent[] = [];

  for (const definition of action.damage) {
    const type = damageType(definition.type);
    const criticalRoll = critical ? rollCriticalExpression(definition.expression, random) : null;
    const roll = criticalRoll?.roll ?? rollDiceExpression(definition.expression, random);
    const raw = Math.max(0, roll.total);
    const immune = immunities.has(type) || immunities.has("all");
    const ignoresArmor = armorPiercing || type === "burn" || type === "heat";
    const armorApplied = immune || ignoresArmor ? 0 : Math.min(armor, raw);
    let final = immune ? 0 : Math.max(0, raw - armorApplied);
    const resisted = !shredded && (resistances.has(type) || resistances.has("all"));
    if (resisted) final = Math.ceil(final / 2);
    if (exposed && type !== "heat" && type !== "burn") final *= 2;
    components.push({
      type,
      expression: definition.expression,
      raw,
      armorApplied,
      resisted,
      exposed,
      final,
      roll,
      criticalDice: criticalRoll?.criticalDice,
    });
  }

  const totalHeat = components.filter((component) => component.type === "heat").reduce((sum, component) => sum + component.final, 0);
  const totalHpDamage = components.filter((component) => component.type !== "heat").reduce((sum, component) => sum + component.final, 0);
  const hpResolution = applyHpDamage(target, totalHpDamage, random);
  const heatResolution = applyHeat(hpResolution.next, totalHeat, random);
  return {
    components,
    totalHpDamage,
    totalHeat,
    nextState: heatResolution.next,
    structureChecks: hpResolution.checks,
    stressChecks: heatResolution.checks,
    destroyed: hpResolution.destroyed,
    meltdown: heatResolution.meltdown,
  };
}

export function resolveLancerAttack(request: LancerAttackRequest): LancerResolution<LancerAttackResult> {
  const random = request.random ?? Math.random;
  const maximumRange = Math.max(0, ...request.action.range.map((entry) => safeNumber(entry.value)));
  if (maximumRange > 0 && request.distance > maximumRange) throw new Error("O alvo está fora do alcance da ação.");
  if (!request.hasLineOfSight) throw new Error("Não há linha de visão válida até o alvo.");

  const usage = prepareLancerActionUse({
    state: request.source,
    action: request.action,
    compendiumItemId: request.sourceCompendiumItemId,
    frequencyContext: request.frequencyContext ?? {
      turnId: "untracked-turn",
      roundId: "untracked-round",
      sceneId: "untracked-scene",
      missionId: "untracked-mission",
    },
  });
  if (!usage.allowed) throw new Error(usage.reason ?? "Esta ação não pode ser usada agora.");

  const isTech = request.action.attackType === "tech";
  const sourceBonus = isTech
    ? safeNumber(request.source.stats.techAttack)
    : safeNumber(request.source.stats.grit);
  const bonus = Math.trunc(request.bonus ?? sourceBonus);
  const targetDefense = Math.trunc(request.targetDefense ?? safeNumber(
    request.target.stats[isTech ? "eDefense" : "evasion"],
    10,
  ));
  const die = Math.floor(random() * 20) + 1;
  const accuracyDifficulty = resolveAccuracyDifficulty(request.accuracy ?? 0, request.difficulty ?? 0, random);
  const total = die + bonus + accuracyDifficulty.applied;
  const hit = total >= targetDefense;
  const critical = hit && total >= 20;
  const outcome: LancerAttackResult["outcome"] = critical ? "critical" : hit ? "hit" : "miss";
  let damage = hit && request.action.damage.length > 0
    ? resolveLancerDamage({ action: request.action, target: request.target, critical, random })
    : null;
  const effects = partitionLancerActionEffects(request.action);
  const sourceHeat = applyHeat(usage.nextState, usage.heatCost, random);
  const sourceEffects = applyLancerEffects(sourceHeat.next, effects.mandatorySource, request.action.sourceId);
  const targetBeforeEffects = damage?.nextState ?? request.target;
  const targetEffects = hit
    ? applyLancerEffects(targetBeforeEffects, effects.mandatoryTarget, request.action.sourceId)
    : applyLancerEffects(targetBeforeEffects, [], request.action.sourceId);
  if (damage) damage = { ...damage, nextState: targetEffects.nextState };
  const result: LancerAttackResult = {
    actionId: request.action.id,
    actionName: request.action.name,
    sourceEntityId: request.sourceEntityId,
    sourceName: request.sourceName,
    targetEntityId: request.targetEntityId,
    targetName: request.targetName,
    attackType: request.action.attackType,
    distance: request.distance,
    range: maximumRange,
    hasLineOfSight: request.hasLineOfSight,
    die,
    bonus,
    accuracyDifficulty,
    total,
    targetDefense,
    outcome,
    damage,
    sourceNextState: sourceEffects.nextState,
    targetNextState: targetEffects.nextState,
    sourceStressChecks: sourceHeat.checks,
    appliedEffects: [...sourceEffects.applied, ...targetEffects.applied],
    optionalEffects: hit ? effects.optional : [],
    unsupportedEffects: [...sourceEffects.unsupported, ...targetEffects.unsupported],
  };

  return {
    result,
    breakdown: [
      { label: "d20", value: die, source: "core" },
      { label: isTech ? "Tech Attack" : "Grit", value: bonus, source: "entity" },
      { label: "Accuracy/Difficulty", value: accuracyDifficulty.applied, source: "context" },
      { label: "Target Defense", value: targetDefense, source: "target" },
    ],
    stateChanges: [
      ...usage.stateChanges,
      ...sourceEffects.stateChanges,
      ...targetEffects.stateChanges,
      ...(damage ? [{ path: "target.current_state", previousValue: request.target, nextValue: damage.nextState, sourceId: request.action.sourceId }] : []),
    ],
    events: [
      { type: "attack_roll", entityId: request.sourceEntityId, payload: result },
      ...(damage ? [{ type: "damage_resolved", entityId: request.targetEntityId, payload: { actionId: request.action.id, damage } }] : []),
      ...(result.appliedEffects.length > 0 ? [{ type: "effects_applied", entityId: request.targetEntityId, payload: { actionId: request.action.id, effects: result.appliedEffects } }] : []),
      ...(result.optionalEffects.length > 0 ? [{ type: "optional_effects_pending", entityId: request.targetEntityId, payload: { actionId: request.action.id, effects: result.optionalEffects } }] : []),
    ],
  };
}

export function createActionEconomyState(overchargeCount = 0): LancerActionEconomyState {
  return {
    quickActionsRemaining: 2,
    standardMoveAvailable: true,
    reactionAvailable: true,
    overchargeAvailable: true,
    overchargeCount: Math.max(0, Math.trunc(overchargeCount)),
    usedActionIds: [],
  };
}

export function spendLancerAction(
  current: LancerActionEconomyState,
  action: Pick<LancerGameActionDefinition, "id" | "activation">,
): LancerActionEconomyResolution {
  const next = structuredClone(current);
  const duplicate = next.usedActionIds.includes(action.id);
  if (duplicate && action.activation !== "free" && action.activation !== "reaction") {
    return { allowed: false, reason: "A mesma ação não pode ser usada mais de uma vez neste turno.", next: current };
  }
  if (action.activation === "full") {
    if (next.quickActionsRemaining < 2) return { allowed: false, reason: "Não há uma ação completa disponível.", next: current };
    next.quickActionsRemaining = 0;
  } else if (action.activation === "quick") {
    if (next.quickActionsRemaining < 1) return { allowed: false, reason: "Não há ação rápida disponível.", next: current };
    next.quickActionsRemaining = (next.quickActionsRemaining - 1) as 0 | 1;
  } else if (action.activation === "reaction") {
    if (!next.reactionAvailable) return { allowed: false, reason: "A reação deste turno já foi usada.", next: current };
    next.reactionAvailable = false;
  }
  if (action.activation !== "free" && action.activation !== "reaction") next.usedActionIds.push(action.id);
  return { allowed: true, reason: null, next };
}

export function overchargeHeatExpression(overchargeCount: number): string {
  if (overchargeCount <= 0) return "1";
  if (overchargeCount === 1) return "1d3";
  if (overchargeCount === 2) return "1d6";
  return "1d6+4";
}

export const LancerCombatEngine = {
  resolveAttack: resolveLancerAttack,
  resolveDamage: resolveLancerDamage,
  actionEconomy: {
    create: createActionEconomyState,
    spend: spendLancerAction,
    overchargeHeatExpression,
  },
};
