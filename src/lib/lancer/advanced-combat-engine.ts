import type {
  LancerCanonicalState,
  LancerConditionState,
  LancerEffectDefinition,
  LancerGameActionDefinition,
  LancerStateChange,
  LancerTriggerDefinition,
} from "@/lib/lancer/types";

export type LancerFrequencyContext = {
  turnId: string;
  roundId: string;
  sceneId: string;
  missionId: string;
};

export type LancerCombatEventContext = {
  type: string;
  actorEntityId: string;
  targetEntityIds: string[];
  payload: Record<string, unknown>;
};

export type LancerEffectApplication = {
  nextState: LancerCanonicalState;
  applied: Record<string, unknown>[];
  unsupported: Record<string, unknown>[];
  stateChanges: LancerStateChange[];
};

export type LancerPreparedAction = {
  allowed: boolean;
  reason: string | null;
  nextState: LancerCanonicalState;
  heatCost: number;
  stateChanges: LancerStateChange[];
};

export type LancerTriggerResolution = {
  matched: LancerTriggerDefinition[];
  mandatoryEffects: LancerEffectDefinition[];
  optionalEffects: LancerEffectDefinition[];
};

function cloneState(state: LancerCanonicalState): LancerCanonicalState {
  return structuredClone(state);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "_");
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function actionMarkers(action: LancerGameActionDefinition): string[] {
  const extra = action as LancerGameActionDefinition & { tags?: unknown; properties?: unknown };
  return [
    ...stringArray(extra.tags),
    ...stringArray(extra.properties),
    ...action.effects.flatMap((effect) => [
      ...stringArray(effect.tags),
      ...stringArray(effect.properties),
    ]),
  ].map(normalized);
}

function frequencyKey(action: LancerGameActionDefinition, context: LancerFrequencyContext): string | null {
  if (!action.frequency) return null;
  const scope = action.frequency === "turn" ? context.turnId
    : action.frequency === "round" ? context.roundId
      : action.frequency === "scene" ? context.sceneId
        : context.missionId;
  return `${action.frequency}:${scope}:${action.id}`;
}

function frequencyUses(state: LancerCanonicalState): string[] {
  return stringArray(state.metadata.frequencyUses);
}

export function canUseLancerFrequency(
  state: LancerCanonicalState,
  action: LancerGameActionDefinition,
  context: LancerFrequencyContext,
): boolean {
  const key = frequencyKey(action, context);
  return !key || !frequencyUses(state).includes(key);
}

function equipmentForAction(
  state: LancerCanonicalState,
  action: LancerGameActionDefinition,
  compendiumItemId?: string | null,
) {
  const source = normalized(action.sourceId);
  return state.equipment.find((equipment) => (
    (!!compendiumItemId && equipment.compendiumItemId === compendiumItemId)
    || normalized(equipment.instanceId) === source
    || normalized(equipment.compendiumItemId) === source
    || normalized(equipment.name) === source
  ));
}

export function prepareLancerActionUse({
  state,
  action,
  frequencyContext,
  compendiumItemId,
}: {
  state: LancerCanonicalState;
  action: LancerGameActionDefinition;
  frequencyContext: LancerFrequencyContext;
  compendiumItemId?: string | null;
}): LancerPreparedAction {
  const nextState = cloneState(state);
  const changes: LancerStateChange[] = [];
  if (!canUseLancerFrequency(nextState, action, frequencyContext)) {
    return { allowed: false, reason: `A frequência ${action.frequency} desta ação já foi usada.`, nextState: state, heatCost: 0, stateChanges: [] };
  }

  const equipment = equipmentForAction(nextState, action, compendiumItemId);
  const markers = new Set(actionMarkers(action));
  if (equipment?.state.destroyed) return { allowed: false, reason: `${equipment.name} está destruído.`, nextState: state, heatCost: 0, stateChanges: [] };
  if (equipment?.state.disabled) return { allowed: false, reason: `${equipment.name} está desativado.`, nextState: state, heatCost: 0, stateChanges: [] };
  if (markers.has("loading") && equipment?.state.loaded === false) {
    return { allowed: false, reason: `${equipment.name} precisa ser recarregado.`, nextState: state, heatCost: 0, stateChanges: [] };
  }

  let heatCost = 0;
  for (const [rawKey, rawCost] of Object.entries(action.resourceCosts)) {
    const key = normalized(rawKey);
    const cost = Math.max(0, Math.trunc(number(rawCost)));
    if (cost === 0) continue;
    if (key === "heat") {
      heatCost += cost;
      continue;
    }
    if ((key === "uses" || key === "charges" || key === "limited") && equipment) {
      const field = key === "charges" ? "charges" : "uses";
      const current = number(equipment.state[field]);
      if (current < cost) return { allowed: false, reason: `${equipment.name} não possui ${field === "uses" ? "usos" : "cargas"} suficientes.`, nextState: state, heatCost: 0, stateChanges: [] };
      equipment.state[field] = current - cost;
      changes.push({ path: `equipment.${equipment.instanceId}.${field}`, previousValue: current, nextValue: current - cost, sourceId: action.sourceId });
      continue;
    }
    const resource = nextState.resources[key];
    if (!resource) continue;
    if (resource.current < cost) return { allowed: false, reason: `O recurso ${rawKey} é insuficiente.`, nextState: state, heatCost: 0, stateChanges: [] };
    const previous = resource.current;
    resource.current -= cost;
    changes.push({ path: `resources.${key}.current`, previousValue: previous, nextValue: resource.current, sourceId: action.sourceId });
  }

  if (markers.has("loading") && equipment) {
    const previous = equipment.state.loaded ?? true;
    equipment.state.loaded = false;
    changes.push({ path: `equipment.${equipment.instanceId}.loaded`, previousValue: previous, nextValue: false, sourceId: action.sourceId });
  }

  const useKey = frequencyKey(action, frequencyContext);
  if (useKey) {
    const previous = frequencyUses(nextState);
    nextState.metadata.frequencyUses = [...previous, useKey];
    changes.push({ path: "metadata.frequencyUses", previousValue: previous, nextValue: nextState.metadata.frequencyUses, sourceId: action.sourceId });
  }
  return { allowed: true, reason: null, nextState, heatCost, stateChanges: changes };
}

function effectTarget(effect: Record<string, unknown>): "source" | "target" {
  const target = normalized(effect.target ?? effect.applies_to);
  return target === "self" || target === "source" || target === "actor" ? "source" : "target";
}

function isOptionalEffect(effect: Record<string, unknown>): boolean {
  return effect.optional === true || normalized(effect.mode) === "optional";
}

export function partitionLancerActionEffects(action: LancerGameActionDefinition): {
  mandatorySource: Record<string, unknown>[];
  mandatoryTarget: Record<string, unknown>[];
  optional: Record<string, unknown>[];
} {
  const result = { mandatorySource: [] as Record<string, unknown>[], mandatoryTarget: [] as Record<string, unknown>[], optional: [] as Record<string, unknown>[] };
  for (const effect of action.effects) {
    if (isOptionalEffect(effect)) result.optional.push(effect);
    else if (effectTarget(effect) === "source") result.mandatorySource.push(effect);
    else result.mandatoryTarget.push(effect);
  }
  return result;
}

function conditionFromEffect(effect: Record<string, unknown>, sourceId?: string | null): LancerConditionState {
  const id = String(effect.id ?? effect.condition_id ?? effect.name ?? effect.condition ?? "custom");
  return {
    id,
    name: String(effect.name ?? effect.condition ?? id),
    sourceId,
    duration: (effect.duration ?? null) as LancerConditionState["duration"],
    remainingDuration: effect.remainingDuration == null ? null : Math.max(0, Math.trunc(number(effect.remainingDuration))),
    effects: Array.isArray(effect.effects) ? effect.effects.map(record) : [],
  };
}

export function applyLancerEffects(
  state: LancerCanonicalState,
  effects: Record<string, unknown>[],
  sourceId?: string | null,
): LancerEffectApplication {
  const nextState = cloneState(state);
  const applied: Record<string, unknown>[] = [];
  const unsupported: Record<string, unknown>[] = [];
  const stateChanges: LancerStateChange[] = [];

  for (const effect of effects) {
    const kind = normalized(effect.kind ?? effect.type);
    if (kind === "condition" || kind === "status") {
      const collection = kind === "status" ? nextState.statuses : nextState.conditions;
      const condition = conditionFromEffect(effect, sourceId);
      if (!collection.some((entry) => normalized(entry.id) === normalized(condition.id))) {
        collection.push(condition);
        stateChanges.push({ path: `${kind}s`, previousValue: null, nextValue: condition, sourceId });
      }
      applied.push(effect);
      continue;
    }
    if (kind === "remove_condition" || kind === "remove_status") {
      const collection = kind === "remove_status" ? nextState.statuses : nextState.conditions;
      const id = normalized(effect.id ?? effect.condition_id ?? effect.name);
      const removed = collection.filter((entry) => normalized(entry.id) === id || normalized(entry.name) === id);
      const remaining = collection.filter((entry) => !removed.includes(entry));
      if (kind === "remove_status") nextState.statuses = remaining;
      else nextState.conditions = remaining;
      stateChanges.push({ path: kind === "remove_status" ? "statuses" : "conditions", previousValue: removed, nextValue: remaining, sourceId });
      applied.push(effect);
      continue;
    }
    if (kind === "resource") {
      const key = normalized(effect.resource ?? effect.resource_id ?? effect.id ?? effect.name);
      const resource = nextState.resources[key];
      if (!resource) { unsupported.push(effect); continue; }
      const previous = resource.current;
      const value = number(effect.value ?? effect.delta);
      resource.current = effect.set === true || normalized(effect.mode) === "set"
        ? Math.max(0, Math.min(resource.max, value))
        : Math.max(0, Math.min(resource.max, previous + value));
      stateChanges.push({ path: `resources.${key}.current`, previousValue: previous, nextValue: resource.current, sourceId });
      applied.push(effect);
      continue;
    }
    if (kind === "stat_bonus") {
      const key = String(effect.stat ?? effect.id ?? effect.name ?? "");
      if (!key) { unsupported.push(effect); continue; }
      const previous = number(nextState.stats[key]);
      nextState.stats[key] = previous + number(effect.value);
      stateChanges.push({ path: `stats.${key}`, previousValue: previous, nextValue: nextState.stats[key], sourceId });
      applied.push(effect);
      continue;
    }
    if (kind === "equipment") {
      const id = String(effect.instanceId ?? effect.equipment_id ?? effect.id ?? "");
      const equipment = nextState.equipment.find((entry) => entry.instanceId === id || entry.compendiumItemId === id);
      const patch = record(effect.state ?? effect.value);
      if (!equipment || Object.keys(patch).length === 0) { unsupported.push(effect); continue; }
      const previous = structuredClone(equipment.state);
      equipment.state = { ...equipment.state, ...patch };
      stateChanges.push({ path: `equipment.${equipment.instanceId}`, previousValue: previous, nextValue: equipment.state, sourceId });
      applied.push(effect);
      continue;
    }
    unsupported.push(effect);
  }
  return { nextState, applied, unsupported, stateChanges };
}

function triggerConditionMatches(condition: Record<string, unknown> | null | undefined, event: LancerCombatEventContext): boolean {
  if (!condition || Object.keys(condition).length === 0) return true;
  return Object.entries(condition).every(([key, expected]) => {
    if (key === "actorEntityId") return event.actorEntityId === expected;
    if (key === "targetEntityId") return event.targetEntityIds.includes(String(expected));
    return event.payload[key] === expected;
  });
}

export function resolveLancerTriggers(
  triggers: LancerTriggerDefinition[],
  event: LancerCombatEventContext,
): LancerTriggerResolution {
  const matched = triggers.filter((trigger) => (
    (normalized(trigger.event) === normalized(event.type) || trigger.event === "*")
    && trigger.effects.every((effect) => triggerConditionMatches(effect.condition, event))
  ));
  return {
    matched,
    mandatoryEffects: matched.filter((trigger) => !trigger.optional).flatMap((trigger) => trigger.effects),
    optionalEffects: matched.filter((trigger) => trigger.optional).flatMap((trigger) => trigger.effects),
  };
}

export function availableLancerReactions({
  actions,
  state,
  event,
  frequencyContext,
  reactionAvailable,
}: {
  actions: LancerGameActionDefinition[];
  state: LancerCanonicalState;
  event: LancerCombatEventContext;
  frequencyContext: LancerFrequencyContext;
  reactionAvailable: boolean;
}): LancerGameActionDefinition[] {
  if (!reactionAvailable) return [];
  const eventName = normalized(event.type);
  return actions.filter((action) => (
    action.activation === "reaction"
    && (action.triggers.length === 0 || action.triggers.some((trigger) => normalized(trigger) === eventName || trigger === "*"))
    && canUseLancerFrequency(state, action, frequencyContext)
  ));
}

export const LancerAdvancedCombatEngine = {
  prepareActionUse: prepareLancerActionUse,
  applyEffects: applyLancerEffects,
  partitionEffects: partitionLancerActionEffects,
  resolveTriggers: resolveLancerTriggers,
  availableReactions: availableLancerReactions,
  canUseFrequency: canUseLancerFrequency,
};
