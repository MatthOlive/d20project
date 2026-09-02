export const DIGIROLE_ATTRS = [
  { id: "strength", short: "STR", label: "Força" },
  { id: "dexterity", short: "DEX", label: "Destreza" },
  { id: "vitality", short: "VIT", label: "Vitalidade" },
  { id: "wisdom", short: "WIS", label: "Sabedoria" },
  { id: "spirit", short: "SPR", label: "Espírito" },
  { id: "charisma", short: "CAR", label: "Carisma" },
] as const;

export type DigiRoleAttr = (typeof DIGIROLE_ATTRS)[number]["id"];

export const DIGIROLE_SKILL_GROUPS = {
  Luta: ["Fight", "Channel", "Clash", "Evasion", "Throw", "Weapons", "Extra (Luta)"],
  Sobrevivência: ["Alert", "Athletic", "Nature", "Stealth", "Extra (Sobrevivência)"],
  Social: ["Empathy", "Etiquette", "Intimidate", "Perform", "Extra (Social)"],
  Conhecimento: ["Crafts", "Lore", "Medicine", "Science", "Extra (Conhecimento)"],
} as const;

export const DIGIROLE_NOTORIETY = ["Connections", "Fame", "Sponsors", "Supporters"] as const;

export const DIGIROLE_STAGES = [
  "In-Training I",
  "In-Training II",
  "Rookie",
  "Champion",
  "Ultimate",
  "Mega",
  "Mega+",
] as const;

export type DigiRoleStage = (typeof DIGIROLE_STAGES)[number];

export const DIGIROLE_SCAN_PER_SUCCESS: Record<DigiRoleStage, number> = {
  "In-Training I": 5,
  "In-Training II": 5,
  Rookie: 4,
  Champion: 3,
  Ultimate: 2,
  Mega: 1,
  "Mega+": 1,
};

export const DIGIROLE_TRAINING_REQUIRED: Partial<Record<DigiRoleStage, number>> = {
  "In-Training II": 3,
  Rookie: 6,
  Champion: 12,
  Ultimate: 24,
  Mega: 36,
};

export function nextDigiRoleRank(rank: string): DigiRoleStage | null {
  const index = DIGIROLE_STAGES.indexOf(rank as DigiRoleStage);
  if (index < 0 || index >= DIGIROLE_STAGES.indexOf("Mega")) return null;
  return DIGIROLE_STAGES[index + 1] ?? null;
}

export const DIGIROLE_STAGE_RULES: Record<
  Exclude<DigiRoleStage, "Mega+">,
  { attrPoints: number; skillPoints: number; skillCap: number; training: number; pe: number; ds: number; victories: number }
> = {
  "In-Training I": { attrPoints: 0, skillPoints: 5, skillCap: 1, training: 0, pe: 0, ds: 0, victories: 0 },
  "In-Training II": { attrPoints: 2, skillPoints: 4, skillCap: 2, training: 3, pe: 2, ds: 1, victories: 4 },
  Rookie: { attrPoints: 2, skillPoints: 3, skillCap: 3, training: 6, pe: 5, ds: 1, victories: 10 },
  Champion: { attrPoints: 2, skillPoints: 2, skillCap: 4, training: 12, pe: 15, ds: 2, victories: 30 },
  Ultimate: { attrPoints: 2, skillPoints: 1, skillCap: 5, training: 24, pe: 25, ds: 4, victories: 50 },
  Mega: { attrPoints: 2, skillPoints: 1, skillCap: 5, training: 36, pe: 40, ds: 6, victories: 80 },
};

export const DIGIROLE_ATTRIBUTES = ["Vaccine", "Virus", "Data", "Unknown", "None", "No"] as const;
export type DigiRoleAttribute = (typeof DIGIROLE_ATTRIBUTES)[number];

export const DIGIROLE_FIELDS = ["VB", "NSo", "NSp", "ME", "JT", "DS", "WG", "DR", "Neutra", "Unclassified"] as const;

export const DIGIROLE_CONDITIONS = [
  "Burn I", "Burn II", "Burn III", "Paralysis", "Frozen Solid", "Poison", "Deadly Poison",
  "Sleep", "Confused", "Flinched", "Disabled", "Immobilization", "Deep Slumber", "Chaos",
  "Crystallization", "Injury", "Disease", "Reverse",
] as const;

export type DigiRoleNumbers = Record<string, number>;

export function defaultDigiRoleAttrs(): Record<DigiRoleAttr, number> {
  return Object.fromEntries(DIGIROLE_ATTRS.map((attr) => [attr.id, 1])) as Record<DigiRoleAttr, number>;
}

export function defaultDigiRoleSkills(): DigiRoleNumbers {
  return Object.fromEntries(
    Object.values(DIGIROLE_SKILL_GROUPS).flat().map((skill) => [skill, 0]),
  );
}

export function defaultDigiRoleNotoriety(): DigiRoleNumbers {
  return Object.fromEntries(DIGIROLE_NOTORIETY.map((skill) => [skill, 0]));
}

export function digiRoleTamerHpMax(attrs: DigiRoleNumbers): number {
  return 3 + Math.max(0, Math.trunc(attrs.vitality ?? 1));
}

export function digiRoleDigimonHpMax(hpBase: number, attrs: DigiRoleNumbers): number {
  return Math.max(1, Math.trunc(hpBase)) + Math.max(0, Math.trunc(attrs.vitality ?? 1));
}

export function digiRoleTamerDsMax(attrs: DigiRoleNumbers, condensedCount = 0): number {
  return Math.max(0, Math.trunc(condensedCount)) + 2 + Math.max(0, Math.trunc(attrs.spirit ?? 1));
}

export function digiRoleDigimonDsMax(attrs: DigiRoleNumbers, stabilizedForms = 1): number {
  return 2 + Math.max(0, Math.trunc(attrs.spirit ?? 1)) + Math.max(0, Math.trunc(stabilizedForms));
}

export function digiRoleInitiativePool(attrs: DigiRoleNumbers, skills: DigiRoleNumbers): number {
  return Math.max(0, Math.trunc(attrs.dexterity ?? 0) + Math.trunc(skills.Alert ?? 0));
}

const FORMULA_ATTRS: Record<string, DigiRoleAttr> = {
  STR: "strength", DEX: "dexterity", VIT: "vitality", WIS: "wisdom", SPR: "spirit", CAR: "charisma",
};

export function digiRoleFormulaPool(
  formula: string,
  attrs: DigiRoleNumbers,
  skills: DigiRoleNumbers,
): number {
  return formula
    .split("+")
    .map((part) => part.trim())
    .reduce((total, part) => {
      if (/^-?\d+$/.test(part)) return total + Number(part);
      const attr = FORMULA_ATTRS[part.toUpperCase()];
      if (attr) return total + (attrs[attr] ?? 0);
      const skillKey = Object.keys(skills).find((key) => key.toLowerCase() === part.toLowerCase());
      return total + (skillKey ? skills[skillKey] ?? 0 : 0);
    }, 0);
}

export type DigiRoleRoll = {
  pool: number;
  chanceDice: number;
  dice: number[];
  chance: number[];
  successes: number;
};

export function rollDigiRole(pool: number, chanceDice = 0): DigiRoleRoll {
  const safePool = Math.max(0, Math.trunc(pool));
  const safeChance = Math.max(0, Math.trunc(chanceDice));
  const dice = Array.from({ length: safePool }, () => Math.floor(Math.random() * 6) + 1);
  const chance = Array.from({ length: safeChance }, () => Math.floor(Math.random() * 6) + 1);
  return {
    pool: safePool,
    chanceDice: safeChance,
    dice,
    chance,
    successes: dice.filter((die) => die >= 4).length + chance.filter((die) => die === 6).length,
  };
}

export function digiRoleAttributeModifier(
  attacker: string | null | undefined,
  defender: string | null | undefined,
): -1 | 0 | 1 {
  const attack = attacker === "No" ? "None" : attacker;
  const defend = defender === "No" ? "None" : defender;
  if (!attack || !defend || attack === defend) return 0;
  if (attack === "Unknown" && ["Vaccine", "Virus", "Data", "None"].includes(defend)) return 1;
  if (defend === "Unknown" && ["Vaccine", "Virus", "Data", "None"].includes(attack)) return -1;
  const beats: Record<string, string> = { Vaccine: "Virus", Virus: "Data", Data: "Vaccine" };
  if (beats[attack] === defend || (["Vaccine", "Virus", "Data"].includes(attack) && defend === "None")) return 1;
  if (beats[defend] === attack || (["Vaccine", "Virus", "Data"].includes(defend) && attack === "None")) return -1;
  return 0;
}

const FIELD_MATRIX: Record<string, Record<string, number>> = {
  VB: { VB: 0, NSo: 1, NSp: -1, ME: 0, JT: 1, DS: 0, WG: 0, DR: -1 },
  NSo: { VB: -1, NSo: 0, NSp: 1, ME: -1, JT: 0, DS: 0, WG: 1, DR: 0 },
  NSp: { VB: 1, NSo: -1, NSp: 0, ME: 0, JT: -1, DS: 0, WG: 1, DR: 0 },
  ME: { VB: 0, NSo: 1, NSp: 0, ME: 0, JT: 1, DS: -1, WG: 0, DR: -1 },
  JT: { VB: -1, NSo: 0, NSp: 1, ME: -1, JT: 0, DS: 1, WG: 0, DR: 0 },
  DS: { VB: 0, NSo: 0, NSp: 0, ME: 1, JT: -1, DS: 0, WG: -1, DR: 1 },
  WG: { VB: 0, NSo: -1, NSp: -1, ME: 0, JT: 0, DS: 1, WG: 0, DR: 1 },
  DR: { VB: 1, NSo: 0, NSp: 0, ME: 1, JT: 0, DS: -1, WG: -1, DR: 0 },
};

export function digiRoleFieldAccuracyModifier(attackerField: string, defenderFields: string[]): number {
  const row = FIELD_MATRIX[attackerField];
  if (!row) return 0;
  return defenderFields.reduce((total, field) => total + (row[field] ?? 0), 0);
}

export function digiRoleDamageAfterDefense(
  successes: number,
  defense: number,
  attributeModifier = 0,
  evaded = false,
): number {
  if (evaded) return 0;
  return Math.max(1, Math.trunc(successes) - Math.max(0, Math.trunc(defense)) + Math.trunc(attributeModifier));
}
