import type {
  LancerBuildState,
  LancerCanonicalState,
  LancerEntityKind,
  LancerGameActionDefinition,
  LancerResolution,
} from "@/lib/lancer/types";
import { LancerBuildEngine } from "@/lib/lancer/build-engine";
import { LancerCombatEngine } from "@/lib/lancer/combat-engine";

export type RandomSource = () => number;

export type DiceTerm = {
  count: number;
  faces: number;
  sign: 1 | -1;
  results: number[];
  subtotal: number;
};

export type DiceExpressionResult = {
  expression: string;
  terms: DiceTerm[];
  modifier: number;
  total: number;
};

export type AccuracyDifficultyResult = {
  accuracy: number;
  difficulty: number;
  net: number;
  dice: number[];
  applied: number;
};

export type LancerCheckResult = {
  die: number;
  bonus: number;
  accuracyDifficulty: AccuracyDifficultyResult;
  total: number;
};

export interface LancerEffectResolver {
  resolve(state: LancerCanonicalState, sources: Record<string, unknown>[]): LancerCanonicalState;
}

export interface LancerBuildValidator {
  validate(build: LancerBuildState): LancerBuildState["validation"];
}

export interface LancerActionResolver {
  resolve(
    action: LancerGameActionDefinition,
    source: LancerCanonicalState,
    target?: LancerCanonicalState | null,
  ): LancerResolution<Record<string, unknown>>;
}

const DICE_EXPRESSION = /^\s*([+-]?\s*(?:\d*d\d+|\d+))(?:\s*([+-])\s*(\d*d\d+|\d+))*\s*$/i;
const DICE_TOKEN = /([+-]?)\s*(?:(\d*)d(\d+)|(\d+))/gi;

function die(random: RandomSource, faces: number): number {
  return Math.floor(random() * faces) + 1;
}

export function rollDiceExpression(
  expression: string,
  random: RandomSource = Math.random,
): DiceExpressionResult {
  const clean = expression.trim();
  if (!clean || !DICE_EXPRESSION.test(clean)) {
    throw new Error(`Expressão de dados inválida: ${expression}`);
  }

  const terms: DiceTerm[] = [];
  let modifier = 0;
  let match: RegExpExecArray | null;
  DICE_TOKEN.lastIndex = 0;
  while ((match = DICE_TOKEN.exec(clean)) !== null) {
    const sign: 1 | -1 = match[1] === "-" ? -1 : 1;
    if (match[3]) {
      const count = Number(match[2] || 1);
      const faces = Number(match[3]);
      if (!Number.isInteger(count) || count < 1 || count > 100) {
        throw new Error("A quantidade de dados deve estar entre 1 e 100.");
      }
      if (!Number.isInteger(faces) || faces < 2 || faces > 1000) {
        throw new Error("O dado deve ter entre 2 e 1000 faces.");
      }
      const results = Array.from({ length: count }, () => die(random, faces));
      const subtotal = sign * results.reduce((sum, value) => sum + value, 0);
      terms.push({ count, faces, sign, results, subtotal });
    } else {
      modifier += sign * Number(match[4] || 0);
    }
  }

  return {
    expression: clean,
    terms,
    modifier,
    total: terms.reduce((sum, term) => sum + term.subtotal, modifier),
  };
}

export function resolveAccuracyDifficulty(
  accuracy: number,
  difficulty: number,
  random: RandomSource = Math.random,
): AccuracyDifficultyResult {
  const safeAccuracy = Math.max(0, Math.trunc(accuracy));
  const safeDifficulty = Math.max(0, Math.trunc(difficulty));
  const net = safeAccuracy - safeDifficulty;
  const dice = Array.from({ length: Math.abs(net) }, () => die(random, 6));
  const highest = dice.length > 0 ? Math.max(...dice) : 0;
  return {
    accuracy: safeAccuracy,
    difficulty: safeDifficulty,
    net,
    dice,
    applied: net === 0 ? 0 : net > 0 ? highest : -highest,
  };
}

export function rollLancerCheck({
  bonus = 0,
  accuracy = 0,
  difficulty = 0,
  random = Math.random,
}: {
  bonus?: number;
  accuracy?: number;
  difficulty?: number;
  random?: RandomSource;
} = {}): LancerCheckResult {
  const d20 = die(random, 20);
  const accuracyDifficulty = resolveAccuracyDifficulty(accuracy, difficulty, random);
  return {
    die: d20,
    bonus: Math.trunc(bonus),
    accuracyDifficulty,
    total: d20 + Math.trunc(bonus) + accuracyDifficulty.applied,
  };
}

export function createEmptyLancerBuild(): LancerBuildState {
  return {
    schemaVersion: 1,
    status: "draft",
    frameId: null,
    pilotId: null,
    licenseLevel: 0,
    mechSkills: { hull: 0, agility: 0, systems: 0, engineering: 0 },
    licenses: [],
    talents: [],
    coreBonusIds: [],
    weaponIds: [],
    systemIds: [],
    gearIds: [],
    armorIds: [],
    reserveIds: [],
    background: "",
    triggerValues: {},
    mountSelections: [],
    validation: { valid: false, errors: [{ code: "BUILD_INCOMPLETE", message: "Build incompleta." }] },
  };
}

export function createInitialLancerState(kind: LancerEntityKind): LancerCanonicalState {
  const base: LancerCanonicalState = {
    schemaVersion: 1,
    kind,
    resources: {},
    stats: {},
    statBreakdowns: {},
    conditions: [],
    statuses: [],
    equipment: [],
    actionIds: [],
    reactionIds: [],
    notes: "",
    metadata: { lifecycle: "draft" },
  };

  if (kind === "pilot") {
    base.resources.hp = { current: 6, max: 6 };
    base.stats = { grit: 0, licenseLevel: 0, size: 0.5, evasion: 10, eDefense: 10, speed: 4 };
    base.statBreakdowns = {
      hp: [{ label: "Base do piloto", value: 6, sourceType: "core" }],
      evasion: [{ label: "Base do piloto", value: 10, sourceType: "core" }],
      eDefense: [{ label: "Base do piloto", value: 10, sourceType: "core" }],
      speed: [{ label: "Base do piloto", value: 4, sourceType: "core" }],
    };
  }

  if (kind === "mech") {
    base.resources.structure = { current: 4, max: 4 };
    base.resources.stress = { current: 4, max: 4 };
    base.resources.corePower = { current: 1, max: 1 };
    base.stats = {
      armor: null,
      size: null,
      evasion: null,
      eDefense: null,
      speed: null,
      sensors: null,
      saveTarget: null,
      techAttack: null,
    };
    base.metadata.awaitingFrame = true;
  }

  return base;
}

export function validateLancerState(state: unknown): state is LancerCanonicalState {
  if (!state || typeof state !== "object") return false;
  const candidate = state as Partial<LancerCanonicalState>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.kind === "string" &&
    !!candidate.resources &&
    typeof candidate.resources === "object" &&
    !!candidate.stats &&
    typeof candidate.stats === "object" &&
    Array.isArray(candidate.conditions) &&
    Array.isArray(candidate.statuses) &&
    Array.isArray(candidate.equipment)
  );
}

export const LancerRulesEngine = {
  dice: {
    rollExpression: rollDiceExpression,
    rollCheck: rollLancerCheck,
    resolveAccuracyDifficulty,
  },
  createInitialState: createInitialLancerState,
  createEmptyBuild: createEmptyLancerBuild,
  builds: LancerBuildEngine,
  combat: LancerCombatEngine,
  validateState: validateLancerState,
};
