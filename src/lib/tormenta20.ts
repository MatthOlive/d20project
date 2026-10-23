export const T20_SYSTEM_ID = "t20";

export type T20AttributeKey =
  | "forca"
  | "destreza"
  | "constituicao"
  | "inteligencia"
  | "sabedoria"
  | "carisma";

export const T20_ATTRIBUTES: { key: T20AttributeKey; label: string; short: string }[] = [
  { key: "forca", label: "Forca", short: "FOR" },
  { key: "destreza", label: "Destreza", short: "DES" },
  { key: "constituicao", label: "Constituicao", short: "CON" },
  { key: "inteligencia", label: "Inteligencia", short: "INT" },
  { key: "sabedoria", label: "Sabedoria", short: "SAB" },
  { key: "carisma", label: "Carisma", short: "CAR" },
];

export const T20_SKILLS = [
  "Acrobacia",
  "Adestramento",
  "Atletismo",
  "Atuacao",
  "Cavalgar",
  "Conhecimento",
  "Cura",
  "Diplomacia",
  "Enganacao",
  "Fortitude",
  "Furtividade",
  "Guerra",
  "Iniciativa",
  "Intimidacao",
  "Intuicao",
  "Investigacao",
  "Jogatina",
  "Ladinagem",
  "Luta",
  "Misticismo",
  "Nobreza",
  "Oficio",
  "Percepcao",
  "Pilotagem",
  "Pontaria",
  "Reflexos",
  "Religiao",
  "Sobrevivencia",
  "Vontade",
] as const;

export const T20_RACES = [
  "Humano",
  "Anao",
  "Dahllan",
  "Elfo",
  "Goblin",
  "Lefou",
  "Minotauro",
  "Qareen",
  "Golem",
  "Hynne",
  "Kliren",
  "Medusa",
  "Osteon",
  "Sereia/Tritao",
  "Silfide",
  "Suraggel",
  "Trog",
] as const;

export const T20_CLASSES = [
  "Arcanista",
  "Barbaro",
  "Bardo",
  "Bucaneiro",
  "Cacador",
  "Cavaleiro",
  "Clerigo",
  "Druida",
  "Guerreiro",
  "Inventor",
  "Ladino",
  "Lutador",
  "Nobre",
  "Paladino",
] as const;

export type T20ClassTrainingRule = {
  fixed: readonly string[];
  choiceCount: number;
  choices: readonly string[];
  requiredChoice?: readonly string[];
};

export type T20ClassDerivedStats = {
  startingHp: number;
  hpPerLevel: number;
  mpPerLevel: number;
};

export type T20Weapon = {
  id: string;
  name: string;
  attackSkill: "Luta" | "Pontaria";
  attackBonus: number;
  damageDice: string;
  damageBonus: number;
  addStrength: boolean;
  spaces?: number;
};

export type T20ArmorEntry = {
  name: string;
  defenseBonus: number;
  armorPenalty: number;
  heavy: boolean;
  spaces: number;
};

export const T20_ARMOR_CATALOG: readonly T20ArmorEntry[] = [
  { name: "Armadura acolchoada", defenseBonus: 1, armorPenalty: 0, heavy: false, spaces: 2 },
  { name: "Armadura de couro", defenseBonus: 2, armorPenalty: 0, heavy: false, spaces: 2 },
  { name: "Couro batido", defenseBonus: 3, armorPenalty: 1, heavy: false, spaces: 2 },
  { name: "Gibão de peles", defenseBonus: 4, armorPenalty: 3, heavy: false, spaces: 2 },
  { name: "Couraça", defenseBonus: 5, armorPenalty: 4, heavy: false, spaces: 2 },
  { name: "Brunea", defenseBonus: 5, armorPenalty: 2, heavy: true, spaces: 5 },
  { name: "Cota de malha", defenseBonus: 6, armorPenalty: 2, heavy: true, spaces: 5 },
  { name: "Loriga segmentada", defenseBonus: 7, armorPenalty: 3, heavy: true, spaces: 5 },
  { name: "Meia armadura", defenseBonus: 8, armorPenalty: 4, heavy: true, spaces: 5 },
  { name: "Armadura completa", defenseBonus: 10, armorPenalty: 5, heavy: true, spaces: 5 },
];

export const T20_SHIELD_CATALOG = [
  { name: "Escudo leve", defenseBonus: 1, armorPenalty: 1, spaces: 1 },
  { name: "Escudo pesado", defenseBonus: 2, armorPenalty: 2, spaces: 2 },
] as const;

export type T20InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  spacesEach: number;
};

export function calculateT20CarryingCapacity(strength: number, hasAdventureBackpack = false) {
  const safeStrength = Math.trunc(Number.isFinite(strength) ? strength : 0);
  return Math.max(0, 10 + (safeStrength >= 0 ? safeStrength * 2 : safeStrength) + (hasAdventureBackpack ? 2 : 0));
}

/** T20 uses abstract spaces; 1,000 coins occupy one space. */
export function calculateT20Encumbrance(
  strength: number,
  items: readonly T20InventoryItem[] | null | undefined,
  coins: number,
  hasAdventureBackpack = false,
  armorName?: string | null,
  shieldName?: string | null,
) {
  const capacity = calculateT20CarryingCapacity(strength, hasAdventureBackpack);
  const carriedItemSpaces = (items ?? []).reduce((sum, item) => {
    const quantity = Math.max(0, Math.trunc(Number(item.quantity) || 0));
    const spacesEach = Math.max(0, Number(item.spacesEach) || 0);
    return sum + quantity * spacesEach;
  }, 0);
  const armor = armorName ? T20_ARMOR_CATALOG.find((item) => normalizeT20Label(item.name) === normalizeT20Label(armorName)) : undefined;
  const shield = shieldName ? T20_SHIELD_CATALOG.find((item) => normalizeT20Label(item.name) === normalizeT20Label(shieldName)) : undefined;
  const equipmentSpaces = (armor?.spaces ?? 0) + (shield?.spaces ?? 0);
  const itemSpaces = carriedItemSpaces + equipmentSpaces;
  const coinSpaces = Math.max(0, Number(coins) || 0) / 1000;
  const spaces = Math.round((itemSpaces + coinSpaces) * 100) / 100;
  const overloaded = spaces > capacity;
  return {
    capacity,
    maximumCapacity: capacity * 2,
    itemSpaces,
    carriedItemSpaces,
    equipmentSpaces,
    coinSpaces,
    spaces,
    overloaded,
    overMaximum: spaces > capacity * 2,
    skillPenalty: overloaded ? 5 : 0,
    speedPenalty: overloaded ? 3 : 0,
  };
}

/** Corebook Defense formula for the listed armors and shields. */
export function calculateT20EquipmentDefense(
  dexterity: number,
  armorName: string | null | undefined,
  shieldName: string | null | undefined,
) {
  const armor = armorName ? T20_ARMOR_CATALOG.find((item) => normalizeT20Label(item.name) === normalizeT20Label(armorName)) : undefined;
  const shield = shieldName ? T20_SHIELD_CATALOG.find((item) => normalizeT20Label(item.name) === normalizeT20Label(shieldName)) : undefined;
  if ((armorName && !armor) || (shieldName && !shield)) return null;
  return {
    defense: 10 + (armor?.heavy ? 0 : dexterity) + (armor?.defenseBonus ?? 0) + (shield?.defenseBonus ?? 0),
    armorPenalty: (armor?.armorPenalty ?? 0) + (shield?.armorPenalty ?? 0),
    armorIsHeavy: armor?.heavy ?? false,
    armorBonus: armor?.defenseBonus ?? 0,
    shieldBonus: shield?.defenseBonus ?? 0,
  };
}

export function isValidT20DamageDice(value: string): boolean {
  const match = value.trim().match(/^(\d{1,2})d(4|6|8|10|12|20)$/i);
  return !!match && Number(match[1]) >= 1 && Number(match[1]) <= 20;
}

export function t20WeaponDamageExpression(weapon: Pick<T20Weapon, "damageDice" | "damageBonus" | "addStrength">, strength: number): string {
  if (!isValidT20DamageDice(weapon.damageDice)) return "";
  const modifier = weapon.damageBonus + (weapon.addStrength ? strength : 0);
  return `${weapon.damageDice.trim()}${modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : ""}`;
}

/** T20 attack checks hit when the final attack total meets or exceeds Defense. */
export function t20AttackHits(total: number, defense: number): boolean {
  return Number.isFinite(total) && Number.isFinite(defense) && total >= defense;
}

export function parseT20DamageExpression(expression: string): { count: number; faces: number; modifier: number } | null {
  const match = expression.trim().match(/^(\d{1,2})d(4|6|8|10|12|20)([+-]\d+)?$/i);
  if (!match) return null;
  const count = Number(match[1]);
  if (count < 1 || count > 20) return null;
  return { count, faces: Number(match[2]), modifier: Number(match[3] ?? 0) };
}

/** Corebook class baselines; equipment, race powers, and multiclassing stay separate. */
export const T20_CLASS_DERIVED_STATS: Record<string, T20ClassDerivedStats> = {
  Arcanista: { startingHp: 8, hpPerLevel: 2, mpPerLevel: 6 },
  Barbaro: { startingHp: 24, hpPerLevel: 6, mpPerLevel: 3 },
  Bardo: { startingHp: 12, hpPerLevel: 3, mpPerLevel: 4 },
  Bucaneiro: { startingHp: 16, hpPerLevel: 4, mpPerLevel: 3 },
  Cacador: { startingHp: 16, hpPerLevel: 4, mpPerLevel: 4 },
  Cavaleiro: { startingHp: 20, hpPerLevel: 5, mpPerLevel: 3 },
  Clerigo: { startingHp: 16, hpPerLevel: 4, mpPerLevel: 5 },
  Druida: { startingHp: 16, hpPerLevel: 4, mpPerLevel: 4 },
  Guerreiro: { startingHp: 20, hpPerLevel: 5, mpPerLevel: 3 },
  Inventor: { startingHp: 12, hpPerLevel: 3, mpPerLevel: 4 },
  Ladino: { startingHp: 12, hpPerLevel: 3, mpPerLevel: 4 },
  Lutador: { startingHp: 20, hpPerLevel: 5, mpPerLevel: 3 },
  Nobre: { startingHp: 16, hpPerLevel: 4, mpPerLevel: 4 },
  Paladino: { startingHp: 20, hpPerLevel: 5, mpPerLevel: 3 },
};

export function calculateT20ClassDerivedStats(
  className: string | null | undefined,
  level: number,
  constitution: number,
  dexterity: number,
) {
  const classKey = className
    ? T20_CLASSES.find((name) => normalizeT20Label(name) === normalizeT20Label(className))
    : undefined;
  const stats = classKey ? T20_CLASS_DERIVED_STATS[classKey] : undefined;
  if (!stats) return null;
  const safeLevel = Math.max(1, Math.floor(level));
  const laterLevelHp = Math.max(1, stats.hpPerLevel + constitution);
  return {
    hpMax: stats.startingHp + constitution + (safeLevel - 1) * laterLevelHp,
    mpMax: stats.mpPerLevel * safeLevel,
    baseDefense: 10 + dexterity,
  };
}

/** Corebook level-1 class skill training. Origin and power training stays separate. */
export const T20_CLASS_TRAINING: Record<string, T20ClassTrainingRule> = {
  Arcanista: { fixed: ["Misticismo", "Vontade"], choiceCount: 2, choices: ["Conhecimento", "Diplomacia", "Enganacao", "Guerra", "Iniciativa", "Intimidacao", "Intuicao", "Investigacao", "Nobreza", "Oficio", "Percepcao"] },
  Barbaro: { fixed: ["Fortitude", "Luta"], choiceCount: 4, choices: ["Adestramento", "Atletismo", "Cavalgar", "Iniciativa", "Intimidacao", "Oficio", "Percepcao", "Pontaria", "Sobrevivencia", "Vontade"] },
  Bardo: { fixed: ["Atuacao", "Reflexos"], choiceCount: 6, choices: ["Acrobacia", "Cavalgar", "Conhecimento", "Diplomacia", "Enganacao", "Furtividade", "Iniciativa", "Intuicao", "Investigacao", "Jogatina", "Ladinagem", "Luta", "Misticismo", "Nobreza", "Percepcao", "Pontaria", "Vontade"] },
  Bucaneiro: { fixed: ["Reflexos"], requiredChoice: ["Luta", "Pontaria"], choiceCount: 4, choices: ["Acrobacia", "Atletismo", "Atuacao", "Enganacao", "Fortitude", "Furtividade", "Iniciativa", "Intimidacao", "Jogatina", "Luta", "Oficio", "Percepcao", "Pilotagem", "Pontaria"] },
  Cacador: { fixed: ["Sobrevivencia"], requiredChoice: ["Luta", "Pontaria"], choiceCount: 6, choices: ["Adestramento", "Atletismo", "Cavalgar", "Cura", "Fortitude", "Furtividade", "Iniciativa", "Investigacao", "Luta", "Oficio", "Percepcao", "Pontaria", "Reflexos"] },
  Cavaleiro: { fixed: ["Fortitude", "Luta"], choiceCount: 2, choices: ["Adestramento", "Atletismo", "Cavalgar", "Diplomacia", "Guerra", "Iniciativa", "Intimidacao", "Nobreza", "Percepcao", "Vontade"] },
  Clerigo: { fixed: ["Religiao", "Vontade"], choiceCount: 2, choices: ["Conhecimento", "Cura", "Diplomacia", "Fortitude", "Iniciativa", "Intuicao", "Luta", "Misticismo", "Nobreza", "Oficio", "Percepcao"] },
  Druida: { fixed: ["Sobrevivencia", "Vontade"], choiceCount: 4, choices: ["Adestramento", "Atletismo", "Cavalgar", "Conhecimento", "Cura", "Fortitude", "Iniciativa", "Intuicao", "Luta", "Misticismo", "Oficio", "Percepcao", "Religiao"] },
  Guerreiro: { fixed: ["Fortitude"], requiredChoice: ["Luta", "Pontaria"], choiceCount: 2, choices: ["Adestramento", "Atletismo", "Cavalgar", "Guerra", "Iniciativa", "Intimidacao", "Luta", "Oficio", "Percepcao", "Pontaria", "Reflexos"] },
  Inventor: { fixed: ["Oficio", "Vontade"], choiceCount: 4, choices: ["Conhecimento", "Cura", "Diplomacia", "Fortitude", "Iniciativa", "Investigacao", "Luta", "Misticismo", "Oficio", "Pilotagem", "Pontaria", "Percepcao"] },
  Ladino: { fixed: ["Ladinagem", "Reflexos"], choiceCount: 8, choices: ["Acrobacia", "Atletismo", "Atuacao", "Cavalgar", "Conhecimento", "Diplomacia", "Enganacao", "Furtividade", "Iniciativa", "Intimidacao", "Intuicao", "Investigacao", "Jogatina", "Luta", "Oficio", "Percepcao", "Pilotagem", "Pontaria"] },
  Lutador: { fixed: ["Fortitude", "Luta"], choiceCount: 4, choices: ["Acrobacia", "Adestramento", "Atletismo", "Enganacao", "Furtividade", "Iniciativa", "Intimidacao", "Oficio", "Percepcao", "Pontaria", "Reflexos"] },
  Nobre: { fixed: ["Vontade"], requiredChoice: ["Diplomacia", "Intimidacao"], choiceCount: 4, choices: ["Adestramento", "Atuacao", "Cavalgar", "Conhecimento", "Diplomacia", "Enganacao", "Fortitude", "Guerra", "Iniciativa", "Intimidacao", "Intuicao", "Investigacao", "Jogatina", "Luta", "Nobreza", "Oficio", "Percepcao", "Pontaria"] },
  Paladino: { fixed: ["Luta", "Vontade"], choiceCount: 2, choices: ["Adestramento", "Atletismo", "Cavalgar", "Cura", "Diplomacia", "Fortitude", "Guerra", "Iniciativa", "Intuicao", "Nobreza", "Percepcao", "Religiao"] },
};

/** Skill benefits listed for each Corebook origin, using the official quick rule of choosing only skills. */
export const T20_ORIGIN_SKILL_OPTIONS: Record<string, readonly string[]> = {
  "Acólito": ["Cura", "Religiao", "Vontade"],
  "Amigo dos Animais": ["Adestramento", "Cavalgar"],
  "Amnésico": [],
  "Aristocrata": ["Diplomacia", "Enganacao", "Nobreza"],
  "Artesão": ["Oficio", "Vontade"],
  "Artista": ["Atuacao", "Enganacao"],
  "Assistente de Laboratorio": ["Oficio", "Misticismo"],
  "Batedor": ["Furtividade", "Percepcao", "Sobrevivencia"],
  "Capanga": ["Luta", "Intimidacao"],
  "Charlatão": ["Enganacao", "Jogatina"],
  "Circense": ["Acrobacia", "Atuacao", "Reflexos"],
  "Criminoso": ["Enganacao", "Furtividade", "Ladinagem"],
  "Curandeiro": ["Cura", "Vontade"],
  "Eremita": ["Misticismo", "Religiao", "Sobrevivencia"],
  "Escravo": ["Atletismo", "Fortitude", "Furtividade"],
  "Estudioso": ["Conhecimento", "Guerra", "Misticismo"],
  "Fazendeiro": ["Adestramento", "Cavalgar", "Oficio", "Sobrevivencia"],
  "Forasteiro": ["Cavalgar", "Pilotagem", "Sobrevivencia"],
  "Gladiador": ["Atuacao", "Luta"],
  "Guarda": ["Investigacao", "Luta", "Percepcao"],
  "Herdeiro": ["Misticismo", "Nobreza", "Oficio"],
  "Herói Camponês": ["Adestramento", "Oficio"],
  "Marujo": ["Atletismo", "Jogatina", "Pilotagem"],
  "Mateiro": ["Atletismo", "Furtividade", "Sobrevivencia"],
  "Membro de Guilda": ["Diplomacia", "Enganacao", "Misticismo", "Oficio"],
  "Mercador": ["Diplomacia", "Intuicao", "Oficio"],
  "Minerador": ["Atletismo", "Fortitude", "Oficio"],
  "Nômade": ["Cavalgar", "Pilotagem", "Sobrevivencia"],
  "Pivete": ["Furtividade", "Iniciativa", "Ladinagem"],
  "Refugiado": ["Fortitude", "Reflexos", "Vontade"],
  "Seguidor": ["Adestramento", "Oficio"],
  "Selvagem": ["Percepcao", "Reflexos", "Sobrevivencia"],
  "Soldado": ["Fortitude", "Guerra", "Luta", "Pontaria"],
  "Taverneiro": ["Diplomacia", "Jogatina", "Oficio"],
  "Trabalhador": ["Atletismo", "Fortitude"],
};

export const T20_ORIGINS = Object.keys(T20_ORIGIN_SKILL_OPTIONS);

function normalizeT20Label(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

function normalizeT20Origin(origin: string): string {
  return normalizeT20Label(origin);
}

function getT20OriginSkills(origin: string | null | undefined): readonly string[] | undefined {
  if (!origin) return undefined;
  const key = Object.keys(T20_ORIGIN_SKILL_OPTIONS).find(
    (candidate) => normalizeT20Origin(candidate) === normalizeT20Origin(origin),
  );
  return key ? T20_ORIGIN_SKILL_OPTIONS[key] : undefined;
}

export function t20OriginSkills(origin: string | null | undefined): readonly string[] | undefined {
  return getT20OriginSkills(origin);
}

export function t20OriginTrainedSkills(origin: string | null | undefined, choices: Record<string, boolean> = {}): Set<string> {
  const allowed = getT20OriginSkills(origin);
  if (!allowed) return new Set();
  return new Set(allowed.filter((skill) => choices[skill]));
}

export function t20OriginTrainingComplete(origin: string | null | undefined, choices: Record<string, boolean> = {}): boolean {
  const allowed = getT20OriginSkills(origin);
  if (!allowed || allowed.length === 0) return false;
  const selected = allowed.filter((skill) => choices[skill]);
  const invalidSelected = Object.entries(choices).some(([skill, selected]) => selected && !allowed.includes(skill));
  return selected.length === 2 && !invalidSelected;
}

export function t20ClassTrainingRule(className: string | null | undefined): T20ClassTrainingRule | undefined {
  if (!className) return undefined;
  return Object.entries(T20_CLASS_TRAINING).find(
    ([name]) => normalizeT20Label(name) === normalizeT20Label(className),
  )?.[1];
}

export function t20ClassTrainedSkills(className: string | null | undefined, choices: Record<string, boolean> = {}): Set<string> {
  const rule = t20ClassTrainingRule(className);
  if (!rule) return new Set();
  return new Set([
    ...rule.fixed,
    ...(rule.requiredChoice?.filter((skill) => choices[skill]) ?? []),
    ...rule.choices.filter((skill) => choices[skill]),
  ]);
}

export function t20ClassTrainingComplete(className: string | null | undefined, choices: Record<string, boolean> = {}): boolean {
  const rule = t20ClassTrainingRule(className);
  if (!rule) return false;
  const selectedRequiredChoice = rule.requiredChoice?.find((skill) => choices[skill]);
  const selected = rule.choices.filter((skill) => choices[skill] && !rule.fixed.includes(skill) && skill !== selectedRequiredChoice);
  const requiredChoiceSelected = !rule.requiredChoice?.length || !!selectedRequiredChoice;
  const validSkills = new Set([...rule.choices, ...(rule.requiredChoice ?? [])]);
  const invalidSelected = Object.entries(choices).some(([skill, selected]) => selected && !validSkills.has(skill));
  return requiredChoiceSelected && selected.length === rule.choiceCount && !invalidSelected;
}

export const T20_QUICK_ROLLS = [
  { label: "Iniciativa", skill: "Iniciativa" },
  { label: "Luta", skill: "Luta" },
  { label: "Pontaria", skill: "Pontaria" },
  { label: "Fortitude", skill: "Fortitude" },
  { label: "Reflexos", skill: "Reflexos" },
  { label: "Vontade", skill: "Vontade" },
] as const;

export const T20_SKILL_ATTRIBUTES: Record<string, T20AttributeKey> = {
  Acrobacia: "destreza",
  Adestramento: "carisma",
  Atletismo: "forca",
  Atuacao: "carisma",
  Cavalgar: "destreza",
  Conhecimento: "inteligencia",
  Cura: "sabedoria",
  Diplomacia: "carisma",
  Enganacao: "carisma",
  Fortitude: "constituicao",
  Furtividade: "destreza",
  Guerra: "inteligencia",
  Iniciativa: "destreza",
  Intimidacao: "carisma",
  Intuicao: "sabedoria",
  Investigacao: "inteligencia",
  Jogatina: "carisma",
  Ladinagem: "destreza",
  Luta: "forca",
  Misticismo: "inteligencia",
  Nobreza: "inteligencia",
  Oficio: "inteligencia",
  Percepcao: "sabedoria",
  Pilotagem: "destreza",
  Pontaria: "destreza",
  Reflexos: "destreza",
  Religiao: "sabedoria",
  Sobrevivencia: "sabedoria",
  Vontade: "sabedoria",
};

export const T20_TRAINED_ONLY_SKILLS = new Set([
  "Adestramento",
  "Atuacao",
  "Conhecimento",
  "Jogatina",
  "Ladinagem",
  "Misticismo",
  "Nobreza",
  "Oficio",
  "Pilotagem",
  "Religiao",
]);

export const T20_ARMOR_PENALTY_SKILLS = new Set([
  "Acrobacia",
  "Furtividade",
  "Ladinagem",
]);

export function t20TrainingBonus(level: number): number {
  if (level >= 15) return 6;
  if (level >= 7) return 4;
  return 2;
}

/**
 * Resolve a skill modifier using the Corebook formula while preserving the
 * previous manually-entered bonus mode for existing character sheets.
 */
export function t20SkillCheck(
  skill: string,
  options: {
    level: number;
    attributes: Partial<Record<T20AttributeKey, number>>;
    trained: boolean;
    useRules: boolean;
    manualBonus?: number;
    armorPenalty?: number;
  },
) {
  if (!options.useRules) {
    return {
      modifier: options.manualBonus ?? 0,
      canRoll: true,
      trainedOnly: T20_TRAINED_ONLY_SKILLS.has(skill),
    };
  }

  const attribute = T20_SKILL_ATTRIBUTES[skill];
  const base = Math.floor(Math.max(1, options.level) / 2) + (attribute ? options.attributes[attribute] ?? 0 : 0);
  const armorPenalty = T20_ARMOR_PENALTY_SKILLS.has(skill)
    ? Math.max(0, options.armorPenalty ?? 0)
    : 0;
  return {
    modifier: base + (options.trained ? t20TrainingBonus(options.level) : 0) - armorPenalty,
    canRoll: !T20_TRAINED_ONLY_SKILLS.has(skill) || options.trained,
    trainedOnly: T20_TRAINED_ONLY_SKILLS.has(skill),
  };
}

export const T20_MECHANICS: { title: string; body: string; category: string }[] = [
  {
    category: "Basico",
    title: "Teste d20",
    body: "Role 1d20, some o modificador do teste e compare com a dificuldade definida pelo narrador. A ficha salva os valores como modificadores prontos para somar.",
  },
  {
    category: "Basico",
    title: "Pericias na ficha",
    body: "Cada pericia guarda o bonus final que voce quer rolar. Isso deixa a primeira versao flexivel: voce pode incluir atributo, treino, nivel e outros ajustes no proprio numero.",
  },
  {
    category: "Combate",
    title: "Iniciativa",
    body: "Use a pericia Iniciativa. Quando a rolagem tem Iniciativa no nome, o personagem entra automaticamente na ordem de turnos usando o total do d20.",
  },
  {
    category: "Combate",
    title: "Ataques",
    body: "Use Luta para ataques corpo a corpo e Pontaria para ataques a distancia. O campo Ataques pode guardar dano, margem, alcance e observacoes de cada arma ou magia ofensiva.",
  },
  {
    category: "Combate",
    title: "Defesas",
    body: "A ficha acompanha PV, PM e Defesa. No mapa, o token T20 mostra PV/PM e permite alterar esses valores rapidamente.",
  },
  {
    category: "Resistencias",
    title: "Fortitude, Reflexos e Vontade",
    body: "Essas tres pericias aparecem como rolagens rapidas porque costumam ser chamadas com frequencia durante cenas perigosas.",
  },
  {
    category: "Personagem",
    title: "Raca, classe e origem",
    body: "A primeira versao guarda as escolhas centrais do personagem e deixa os efeitos mecanicos nos campos de atributos, pericias, poderes e notas.",
  },
  {
    category: "Personagem",
    title: "Poderes, magias e inventario",
    body: "Use os blocos de texto para registrar poderes, magias, equipamentos e recursos. A proxima etapa pode transformar esses blocos em listas com botoes de rolagem.",
  },
] as const;

export const T20_MECHANICS_CATEGORY_ORDER = ["Basico", "Combate", "Resistencias", "Personagem"];

export type T20RollResult = {
  system: "t20";
  die: number;
  modifier: number;
  total: number;
};

export function rollD20(modifier = 0): T20RollResult {
  const die = Math.floor(Math.random() * 20) + 1;
  return { system: "t20", die, modifier, total: die + modifier };
}

export function defaultT20Attributes(): Record<T20AttributeKey, number> {
  return {
    forca: 0,
    destreza: 0,
    constituicao: 0,
    inteligencia: 0,
    sabedoria: 0,
    carisma: 0,
  };
}

export function defaultT20Skills(): Record<string, number> {
  return Object.fromEntries(T20_SKILLS.map((skill) => [skill, 0]));
}

export function parseT20RollLines(text: string | null | undefined) {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.*?)(?:\s+([+-]?\d+))\s*$/);
      if (!match) return null;
      const label = match[1].trim();
      const modifier = Number(match[2]);
      if (!label || !Number.isFinite(modifier)) return null;
      return { label, modifier };
    })
    .filter((item): item is { label: string; modifier: number } => !!item);
}
