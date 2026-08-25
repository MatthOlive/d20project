import type {
  LancerCanonicalState,
  LancerCompendiumItem,
  LancerDeploymentHex,
  LancerEncounterObjective,
  LancerEncounterRosterEntry,
} from "@/lib/lancer/types";

export type LancerNpcComposition = {
  name: string;
  tier: 1 | 2 | 3;
  classItem: LancerCompendiumItem;
  templates: LancerCompendiumItem[];
  optionalFeatures: LancerCompendiumItem[];
};

export type LancerNpcCompositionResult = {
  state: LancerCanonicalState;
  actionIds: string[];
  selectedItemIds: string[];
  warnings: string[];
};

export type LancerEncounterDraft = {
  name: string;
  mapId: string;
  objective: LancerEncounterObjective;
  roster: LancerEncounterRosterEntry[];
  deployment: {
    player: LancerDeploymentHex[];
    enemy: LancerDeploymentHex[];
    reserve: LancerDeploymentHex[];
  };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function tierValue(value: unknown, tier: 1 | 2 | 3): number | null {
  const direct = finiteNumber(value);
  if (direct != null) return direct;
  if (Array.isArray(value)) return tierValue(value[tier - 1], tier);
  const source = record(value);
  for (const key of [String(tier), `tier${tier}`, `tier_${tier}`, `t${tier}`]) {
    const selected = finiteNumber(source[key]);
    if (selected != null) return selected;
  }
  for (const key of ["value", "val", "base"]) {
    if (!(key in source) || source[key] == null) continue;
    const selected = tierValue(source[key], tier);
    if (selected != null) return selected;
  }
  return null;
}

function statSource(item: LancerCompendiumItem, tier: 1 | 2 | 3): Record<string, unknown> {
  const data = item.data;
  const rawStats = data.stats;
  const selectedStats = Array.isArray(rawStats)
    ? record(rawStats[tier - 1])
    : record(rawStats);
  const tierStats = record(
    data[`tier${tier}`]
    ?? data[`tier_${tier}`]
    ?? record(data.tiers)[String(tier)],
  );
  return { ...data, ...selectedStats, ...tierStats };
}

function readStat(
  source: Record<string, unknown>,
  keys: string[],
  tier: 1 | 2 | 3,
  fallback: number,
): number {
  for (const key of keys) {
    const value = tierValue(source[key], tier);
    if (value != null) return value;
  }
  return fallback;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function applyNpcStatEffects(
  state: LancerCanonicalState,
  items: LancerCompendiumItem[],
): void {
  for (const item of items) {
    for (const effect of item.effect_definitions) {
      if (effect.kind !== "stat_bonus" || !effect.target || typeof effect.value !== "number") continue;
      state.stats[effect.target] = Number(state.stats[effect.target] ?? 0) + effect.value;
      state.statBreakdowns[effect.target] = [
        ...(state.statBreakdowns[effect.target] ?? []),
        {
          label: item.name,
          value: effect.value,
          sourceType: item.source_type,
          sourceId: item.id,
        },
      ];
    }
  }
}

export function composeLancerNpc({
  name,
  tier,
  classItem,
  templates,
  optionalFeatures,
}: LancerNpcComposition): LancerNpcCompositionResult {
  if (classItem.item_type !== "npc_class") throw new Error("Selecione uma classe de NPC válida.");
  const source = statSource(classItem, tier);
  const hp = Math.max(1, readStat(source, ["hp", "base_hp"], tier, 10 + (tier - 1) * 5));
  const heatCap = Math.max(0, readStat(source, ["heatcap", "heat_cap", "heat_capacity"], tier, 0));
  const structure = Math.max(1, readStat(source, ["structure"], tier, 1));
  const stress = Math.max(1, readStat(source, ["stress"], tier, heatCap > 0 ? 1 : 0));
  const selected = [classItem, ...templates, ...optionalFeatures];
  const actionIds = unique(selected.flatMap((item) => item.action_definitions.map((action) => action.id)));
  const reactionIds = unique(selected.flatMap((item) => item.action_definitions
    .filter((action) => action.activation === "reaction")
    .map((action) => action.id)));
  const stats: Record<string, number | null> = {
    tier,
    armor: readStat(source, ["armor"], tier, 0),
    size: readStat(source, ["size"], tier, 1),
    evasion: readStat(source, ["evasion", "evade"], tier, 8),
    eDefense: readStat(source, ["e_defense", "edef", "edefense"], tier, 8),
    speed: readStat(source, ["speed"], tier, 4),
    sensors: readStat(source, ["sensor_range", "sensors"], tier, 10),
    saveTarget: readStat(source, ["save", "save_target"], tier, 10 + tier),
    techAttack: readStat(source, ["tech_attack", "tech_attack_bonus"], tier, 0),
    hull: readStat(source, ["hull"], tier, 0),
    agility: readStat(source, ["agility"], tier, 0),
    systems: readStat(source, ["systems"], tier, 0),
    engineering: readStat(source, ["engineering"], tier, 0),
  };
  const state: LancerCanonicalState = {
    schemaVersion: 1,
    kind: "npc",
    resources: {
      hp: { current: hp, max: hp },
      ...(heatCap > 0 ? { heat: { current: 0, max: heatCap } } : {}),
      structure: { current: structure, max: structure },
      ...(stress > 0 ? { stress: { current: stress, max: stress } } : {}),
    },
    stats,
    statBreakdowns: Object.fromEntries(Object.entries(stats)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
      .map(([key, value]) => [key, [{
        label: `${classItem.name} T${tier}`,
        value,
        sourceType: classItem.source_type,
        sourceId: classItem.id,
      }]])),
    conditions: [],
    statuses: [],
    equipment: selected.slice(1).map((item) => ({
      instanceId: `${item.id}:${tier}`,
      compendiumItemId: item.id,
      sourceType: item.source_type,
      name: item.name,
      state: { loaded: true, active: true },
    })),
    actionIds,
    reactionIds,
    notes: "",
    metadata: {
      lifecycle: "ready",
      npcName: name.trim(),
      npcClassId: classItem.id,
      npcClassName: classItem.name,
      npcTier: tier,
      npcTemplateIds: templates.map((item) => item.id),
      npcOptionalFeatureIds: optionalFeatures.map((item) => item.id),
    },
  };
  applyNpcStatEffects(state, selected);
  const warnings: string[] = [];
  if (actionIds.length === 0) warnings.push("A composição não possui ações normalizadas no pacote ativo.");
  if (optionalFeatures.length === 0) warnings.push("Nenhuma feature opcional foi selecionada.");
  return {
    state,
    actionIds,
    selectedItemIds: selected.map((item) => item.id),
    warnings,
  };
}

export function parseLancerDeploymentHexes(value: string): LancerDeploymentHex[] {
  const seen = new Set<string>();
  const result: LancerDeploymentHex[] = [];
  for (const raw of value.split(/[;\n]+/)) {
    const match = raw.trim().match(/^(-?\d+)\s*[,/:]\s*(-?\d+)$/);
    if (!match) continue;
    const coord = { q: Number(match[1]), r: Number(match[2]) };
    const key = `${coord.q}:${coord.r}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(coord);
    }
  }
  return result;
}

export function validateLancerEncounter(draft: LancerEncounterDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("Informe o nome do encontro.");
  if (!draft.mapId) errors.push("Selecione um mapa.");
  if (!draft.objective.name.trim()) errors.push("Defina o objetivo.");
  if (!draft.objective.victoryCondition.trim()) errors.push("Defina a condição de vitória.");
  if (draft.roster.reduce((sum, entry) => sum + Math.max(0, entry.count), 0) === 0) {
    errors.push("Adicione pelo menos um NPC inimigo.");
  }
  const immediateEnemies = draft.roster
    .filter((entry) => !entry.reserve && !entry.reinforcementRound)
    .reduce((sum, entry) => sum + Math.max(0, entry.count), 0);
  if (draft.deployment.enemy.length < immediateEnemies) {
    errors.push(`A zona inimiga precisa de ${immediateEnemies} hexágono(s) livre(s).`);
  }
  return errors;
}

export function evaluateLancerObjective(
  objective: LancerEncounterObjective,
  state: { round: number; playerScore: number; hostileScore: number; hostilesRemaining: number; playersRemaining: number },
): "victory" | "defeat" | null {
  if (state.playersRemaining <= 0) return "defeat";
  if (objective.type === "elimination" && state.hostilesRemaining <= 0) return "victory";
  if (objective.scoreTarget != null && state.playerScore >= objective.scoreTarget) return "victory";
  if (objective.scoreTarget != null && state.hostileScore >= objective.scoreTarget) return "defeat";
  if (objective.roundLimit != null && state.round > objective.roundLimit) {
    return state.playerScore > state.hostileScore ? "victory" : "defeat";
  }
  return null;
}

export const LancerGmEngine = {
  composeNpc: composeLancerNpc,
  parseDeploymentHexes: parseLancerDeploymentHexes,
  validateEncounter: validateLancerEncounter,
  evaluateObjective: evaluateLancerObjective,
};
