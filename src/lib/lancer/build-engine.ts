import type {
  LancerBuildState,
  LancerCanonicalState,
  LancerCompendiumItem,
  LancerValueBreakdown,
} from "@/lib/lancer/types";

type FrameStats = {
  hp: number;
  armor: number;
  size: number;
  evasion: number;
  eDefense: number;
  speed: number;
  heatCap: number;
  repairCap: number;
  sensors: number;
  saveTarget: number;
  techAttack: number;
  systemPoints: number;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberFrom(source: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

function frameStats(item: LancerCompendiumItem): FrameStats {
  const data = item.data;
  const stats = { ...data, ...record(data.stats) };
  return {
    hp: numberFrom(stats, ["hp", "base_hp"]),
    armor: numberFrom(stats, ["armor"]),
    size: numberFrom(stats, ["size"], 1),
    evasion: numberFrom(stats, ["evasion", "evade"]),
    eDefense: numberFrom(stats, ["e_defense", "edef", "edefense"]),
    speed: numberFrom(stats, ["speed"]),
    heatCap: numberFrom(stats, ["heatcap", "heat_cap"]),
    repairCap: numberFrom(stats, ["repcap", "repair_cap"]),
    sensors: numberFrom(stats, ["sensor_range", "sensors"]),
    saveTarget: numberFrom(stats, ["save", "save_target"]),
    techAttack: numberFrom(stats, ["tech_attack", "tech_attack_bonus"]),
    systemPoints: numberFrom(stats, ["sp", "system_points"]),
  };
}

function source(label: string, value: number, sourceId?: string): LancerValueBreakdown {
  return { label, value, sourceType: sourceId ? "lcp" : "core", sourceId };
}

function preserveResource(current: number | undefined, previousMax: number | undefined, nextMax: number) {
  if (current == null || previousMax == null) return { current: nextMax, max: nextMax };
  const missing = Math.max(0, previousMax - current);
  return { current: Math.max(0, nextMax - missing), max: nextMax };
}

function applyStructuredEffects(state: LancerCanonicalState, selectedItems: LancerCompendiumItem[]): LancerCanonicalState {
  const previousTotals = record(state.metadata.effectStatTotals);
  for (const [target, rawValue] of Object.entries(previousTotals)) {
    if (typeof state.stats[target] === "number") state.stats[target] = (state.stats[target] as number) - Number(rawValue || 0);
  }
  const totals: Record<string, number> = {};
  for (const item of selectedItems) {
    for (const effect of item.effect_definitions) {
      if (effect.kind !== "stat_bonus" || !effect.target || typeof effect.value !== "number") continue;
      totals[effect.target] = (totals[effect.target] ?? 0) + effect.value;
      state.stats[effect.target] = Number(state.stats[effect.target] ?? 0) + effect.value;
      state.statBreakdowns[effect.target] = [
        ...(state.statBreakdowns[effect.target] ?? []),
        { label: item.name, value: effect.value, sourceType: item.source_type, sourceId: item.id },
      ];
    }
  }
  state.metadata = { ...state.metadata, effectStatTotals: totals };
  const actionIds = selectedItems.flatMap((item) => item.action_definitions.map((action) => action.id));
  const reactionIds = selectedItems.flatMap((item) => item.action_definitions.filter((action) => action.activation === "reaction").map((action) => action.id));
  state.actionIds = [...new Set(actionIds)];
  state.reactionIds = [...new Set(reactionIds)];
  return state;
}

export function gritForLicenseLevel(licenseLevel: number): number {
  return Math.ceil(Math.max(0, Math.min(12, licenseLevel)) / 2);
}

export function validateLancerBuild(
  build: LancerBuildState,
  items: LancerCompendiumItem[],
): LancerBuildState["validation"] {
  const errors: LancerBuildState["validation"]["errors"] = [];
  const level = Math.max(0, Math.min(12, Math.trunc(build.licenseLevel)));
  const skillValues = Object.values(build.mechSkills);
  if (skillValues.some((value) => value < 0 || value > 6 || !Number.isInteger(value))) {
    errors.push({ code: "INVALID_MECH_SKILL", message: "Mech Skills devem ser inteiras entre 0 e 6." });
  }
  if (skillValues.reduce((sum, value) => sum + value, 0) > level + 2) {
    errors.push({ code: "MECH_SKILL_POINTS", message: `No LL${level}, distribua no máximo ${level + 2} pontos em HASE.` });
  }
  if (build.licenses.reduce((sum, value) => sum + value.rank, 0) > level) {
    errors.push({ code: "LICENSE_RANKS", message: `O total de ranks de licença não pode exceder LL${level}.` });
  }
  if (build.talents.reduce((sum, value) => sum + value.rank, 0) > level + 3) {
    errors.push({ code: "TALENT_RANKS", message: `O total de ranks de talento não pode exceder ${level + 3}.` });
  }
  if (build.coreBonusIds.length > Math.floor(level / 3)) {
    errors.push({ code: "CORE_BONUSES", message: `LL${level} permite ${Math.floor(level / 3)} Core Bonus.` });
  }

  if (build.frameId) {
    const frame = items.find((item) => item.id === build.frameId && item.item_type === "frame");
    if (!frame) errors.push({ code: "FRAME_MISSING", message: "O frame selecionado não está disponível.", sourceId: build.frameId });
    if (frame) {
      const stats = frameStats(frame);
      const grit = gritForLicenseLevel(level);
      const maxSp = stats.systemPoints + grit + Math.floor(build.mechSkills.systems / 2);
      const usedSp = build.systemIds.reduce((sum, id) => {
        const system = items.find((item) => item.id === id);
        return sum + numberFrom(system?.data ?? {}, ["sp", "sp_cost", "cost"]);
      }, 0);
      if (usedSp > maxSp) errors.push({ code: "SYSTEM_POINTS", message: `Sistemas usam ${usedSp}/${maxSp} SP.` });
      const mounts = Array.isArray(frame.data.mounts) ? frame.data.mounts : [];
      if (mounts.length > 0 && build.weaponIds.length > mounts.length * 2) {
        errors.push({ code: "MOUNTS", message: "Há mais armas que espaços disponíveis nos mounts do frame." });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function recalculateLancerEntity(
  current: LancerCanonicalState,
  buildInput: LancerBuildState,
  items: LancerCompendiumItem[],
): { state: LancerCanonicalState; build: LancerBuildState } {
  const level = Math.max(0, Math.min(12, Math.trunc(buildInput.licenseLevel)));
  const grit = gritForLicenseLevel(level);
  const build: LancerBuildState = {
    ...buildInput,
    licenseLevel: level,
    validation: validateLancerBuild(buildInput, items),
  };
  build.status = build.validation.valid ? "valid" : "invalid";
  const state: LancerCanonicalState = structuredClone(current);
  state.stats.licenseLevel = level;
  state.stats.grit = grit;
  state.metadata = {
    ...state.metadata,
    background: build.background ?? "",
    triggerValues: build.triggerValues ?? {},
  };

  if (state.kind === "pilot") {
    const hp = 6 + grit;
    state.resources.hp = preserveResource(state.resources.hp?.current, state.resources.hp?.max, hp);
    state.statBreakdowns.hp = [source("Base do piloto", 6), source("Grit", grit)];
    state.equipment = items
      .filter((item) => [...(build.gearIds ?? []), ...(build.armorIds ?? [])].includes(item.id))
      .map((item) => ({
        instanceId: item.id,
        compendiumItemId: item.id,
        sourceType: item.source_type,
        name: item.name,
        state: {},
      }));
  }

  if (state.kind === "mech") {
    const frame = items.find((item) => item.id === build.frameId && item.item_type === "frame");
    if (!frame) {
      state.metadata = { ...state.metadata, awaitingFrame: true };
      return { state: applyStructuredEffects(state, []), build };
    }
    const base = frameStats(frame);
    const hase = build.mechSkills;
    const hp = base.hp + grit + hase.hull * 2;
    const heatCap = base.heatCap + hase.engineering;
    const repairCap = base.repairCap + Math.floor(hase.hull / 2);
    const systemPoints = base.systemPoints + grit + Math.floor(hase.systems / 2);
    state.resources.hp = preserveResource(state.resources.hp?.current, state.resources.hp?.max, hp);
    state.resources.heat = preserveResource(state.resources.heat?.current, state.resources.heat?.max, heatCap);
    state.resources.repairs = preserveResource(state.resources.repairs?.current, state.resources.repairs?.max, repairCap);
    state.stats = {
      ...state.stats,
      licenseLevel: level,
      grit,
      armor: base.armor,
      size: base.size,
      evasion: base.evasion + hase.agility,
      eDefense: base.eDefense + hase.systems,
      speed: base.speed + Math.floor(hase.agility / 2),
      sensors: base.sensors,
      saveTarget: base.saveTarget + grit,
      techAttack: base.techAttack + hase.systems,
      systemPoints,
      limitedBonus: Math.floor(hase.engineering / 2),
    };
    state.statBreakdowns = {
      hp: [source(frame.name, base.hp, frame.id), source("Grit", grit), source("Hull", hase.hull * 2)],
      heatCap: [source(frame.name, base.heatCap, frame.id), source("Engineering", hase.engineering)],
      repairs: [source(frame.name, base.repairCap, frame.id), source("Hull", Math.floor(hase.hull / 2))],
      evasion: [source(frame.name, base.evasion, frame.id), source("Agility", hase.agility)],
      eDefense: [source(frame.name, base.eDefense, frame.id), source("Systems", hase.systems)],
      speed: [source(frame.name, base.speed, frame.id), source("Agility", Math.floor(hase.agility / 2))],
      saveTarget: [source(frame.name, base.saveTarget, frame.id), source("Grit", grit)],
      techAttack: [source(frame.name, base.techAttack, frame.id), source("Systems", hase.systems)],
      systemPoints: [source(frame.name, base.systemPoints, frame.id), source("Grit", grit), source("Systems", Math.floor(hase.systems / 2))],
    };
    const selectedIds = [...build.weaponIds, ...build.systemIds];
    state.equipment = items.filter((item) => selectedIds.includes(item.id)).map((item) => ({
      instanceId: item.id,
      compendiumItemId: item.id,
      sourceType: item.source_type,
      name: item.name,
      state: {
        loaded: true,
        uses: numberFrom(item.data, ["uses", "limited"]),
      },
    }));
    state.metadata = { ...state.metadata, awaitingFrame: false, frameName: frame.name, frameId: frame.id };
  }

  const selectedIds = new Set([
    build.frameId,
    ...build.talents.map((entry) => entry.id),
    ...build.licenses.map((entry) => entry.id),
    ...build.coreBonusIds,
    ...build.weaponIds,
    ...build.systemIds,
    ...(build.gearIds ?? []),
    ...(build.armorIds ?? []),
    ...(build.reserveIds ?? []),
  ].filter((id): id is string => !!id));
  return { state: applyStructuredEffects(state, items.filter((item) => selectedIds.has(item.id))), build };
}

export const LancerBuildEngine = {
  gritForLicenseLevel,
  validate: validateLancerBuild,
  recalculate: recalculateLancerEntity,
  applyEffects: applyStructuredEffects,
};
