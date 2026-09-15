// Pokérole 2.0 shared constants and helpers

export const RANKS = ["starter", "beginner", "amateur", "ace", "pro", "master"] as const;
export type Rank = (typeof RANKS)[number];

export const RANK_LABELS: Record<Rank, string> = {
  starter: "Starter",
  beginner: "Beginner",
  amateur: "Amateur",
  ace: "Ace",
  pro: "Pro",
  master: "Master",
};

export const RANK_BONUS: Record<Rank, number> = {
  starter: 1,
  beginner: 2,
  amateur: 3,
  ace: 4,
  pro: 5,
  master: 6,
};

export function rankAtLeast(target: Rank, current: Rank): boolean {
  return RANKS.indexOf(current) >= RANKS.indexOf(target);
}

export const ATTRS = [
  "strength",
  "dexterity",
  "vitality",
  "insight",
] as const;
export type Attr = (typeof ATTRS)[number];

// Pokémon use a different attribute set than Trainers
export const POKEMON_ATTRS = [
  "strength",
  "dexterity",
  "vitality",
  "special",
  "insight",
] as const;

// Social attributes (Contest / Charm stats) — shared by Trainers and Pokémon
export const SOCIAL_ATTRS = ["tough", "cool", "beautiful", "cute", "clever"] as const;
export type SocialAttr = (typeof SOCIAL_ATTRS)[number];

export const HUMAN_ATTR_CAP = 5;

export const SKILLS = [
  "Brawl", "Channel", "Clash", "Evasion",
  "Alert", "Athletic", "Nature", "Stealth", "Allure", "Etiquette",
  "Intimidate", "Perform", "Crafts", "Lore", "Medicine", "Science",
  "Empathy",
] as const;

// Trainers do not have Channel; they have Throw and Weapons instead.
export const TRAINER_SKILLS = [
  "Brawl", "Throw", "Weapons", "Clash", "Evasion",
  "Alert", "Athletic", "Nature", "Stealth", "Allure", "Etiquette",
  "Intimidate", "Perform", "Crafts", "Lore", "Medicine", "Science",
  "Empathy",
] as const;

export const POKEMON_TYPES = [
  "normal","fire","water","electric","grass","ice","fighting","poison","ground",
  "flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy","typeless",
] as const;
export type PokemonType = (typeof POKEMON_TYPES)[number];

// Tailwind-safe hex per type for move cards
export const TYPE_COLORS: Record<PokemonType, { bg: string; fg: string }> = {
  normal:   { bg: "#A8A878", fg: "#fff" },
  fire:     { bg: "#F08030", fg: "#fff" },
  water:    { bg: "#6890F0", fg: "#fff" },
  electric: { bg: "#F8D030", fg: "#222" },
  grass:    { bg: "#78C850", fg: "#fff" },
  ice:      { bg: "#98D8D8", fg: "#222" },
  fighting: { bg: "#C03028", fg: "#fff" },
  poison:   { bg: "#A040A0", fg: "#fff" },
  ground:   { bg: "#E0C068", fg: "#222" },
  flying:   { bg: "#A890F0", fg: "#fff" },
  psychic:  { bg: "#F85888", fg: "#fff" },
  bug:      { bg: "#A8B820", fg: "#fff" },
  rock:     { bg: "#B8A038", fg: "#fff" },
  ghost:    { bg: "#705898", fg: "#fff" },
  dragon:   { bg: "#7038F8", fg: "#fff" },
  dark:     { bg: "#705848", fg: "#fff" },
  steel:    { bg: "#B8B8D0", fg: "#222" },
  fairy:    { bg: "#EE99AC", fg: "#222" },
  typeless: { bg: "#9aa0a6", fg: "#fff" },
};

// Roll N d6, Pokérole 2.0: success on 4+
export function rollD6(n: number): { dice: number[]; successes: number; ones: number } {
  const dice: number[] = [];
  for (let i = 0; i < Math.max(0, Math.min(50, n)); i++) {
    dice.push(1 + Math.floor(Math.random() * 6));
  }
  return {
    dice,
    successes: dice.filter((d) => d >= 4).length,
    ones: dice.filter((d) => d === 1).length,
  };
}

// Generic NdM dice roller. Successes only meaningful for d6 (Pokérole).
export function rollDice(n: number, faces: number): {
  dice: number[]; successes: number; ones: number; faces: number;
} {
  const dice: number[] = [];
  const f = Math.max(2, Math.min(1000, Math.floor(faces)));
  for (let i = 0; i < Math.max(0, Math.min(50, n)); i++) {
    dice.push(1 + Math.floor(Math.random() * f));
  }
  return {
    dice,
    successes: f === 6 ? dice.filter((d) => d >= 4).length : 0,
    ones: f === 6 ? dice.filter((d) => d === 1).length : 0,
    faces: f,
  };
}

// /roll or /r syntax: "5", "5d6", "3d20", optional label
export function parseRollCommand(input: string): { n: number; faces: number; label?: string } | null {
  const m = input.trim().match(/^\/(?:r|roll)\s+(\d+)(?:d(\d+))?(?:\s+(.+))?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const faces = m[2] ? parseInt(m[2], 10) : 6;
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(faces) || faces < 2) return null;
  return { n, faces, label: m[3]?.trim() };
}

// Skills in DB rows (moves table) are lowercase, sometimes compound like
// "brawl/channel". Characters store skills with TitleCase keys. This helper
// resolves the best matching skill value from a character's skill map.
const SKILL_NAME_ALIASES: Record<string, string[]> = {
  athletic: ["athletic", "athletics"],
  athletics: ["athletic", "athletics"],
};

// Accuracy formulas verified against Pokerole-Data v2.0/Moves.
// Source revision: e0f5c1615c4ba06b934bfb2663a2edba6062dca4. Null pairs require an explicit pool.
const MOVE_ACCURACY_CORRECTIONS: Record<string, [string | null, string | null]> = {
  "absorb": [
    "dexterity",
    "channel"
  ],
  "accelerock": [
    "dexterity",
    "brawl"
  ],
  "acid": [
    "dexterity",
    "channel"
  ],
  "acid armor": [
    "special",
    "nature"
  ],
  "acid spray": [
    "dexterity",
    "channel"
  ],
  "acrobatics": [
    "dexterity",
    "brawl"
  ],
  "acupressure": [
    "dexterity",
    "nature"
  ],
  "aerial ace": [
    "dexterity",
    "brawl"
  ],
  "aeroblast": [
    "special",
    "channel"
  ],
  "after you": [
    "cool",
    "etiquette"
  ],
  "agility": [
    "dexterity",
    "athletic"
  ],
  "air cutter": [
    "dexterity",
    "channel"
  ],
  "air slash": [
    "dexterity",
    "channel"
  ],
  "ally switch": [
    "special",
    "channel"
  ],
  "amnesia": [
    "insight",
    "alert"
  ],
  "anchor shot": [
    "dexterity",
    "brawl"
  ],
  "ancient power": [
    "dexterity",
    "channel"
  ],
  "any move": [
    null,
    null
  ],
  "apple acid": [
    "dexterity",
    "channel"
  ],
  "aqua jet": [
    "dexterity",
    "brawl"
  ],
  "aqua ring": [
    "special",
    "nature"
  ],
  "aqua tail": [
    "dexterity",
    "brawl"
  ],
  "arm thrust": [
    "dexterity",
    "brawl"
  ],
  "aromatherapy": [
    "insight",
    "nature"
  ],
  "aromatic mist": [
    "insight",
    "nature"
  ],
  "assist": [
    "clever",
    "perform"
  ],
  "assurance": [
    "dexterity",
    "brawl"
  ],
  "astonish": [
    "dexterity",
    "brawl"
  ],
  "attack order": [
    "tough",
    "nature"
  ],
  "attract": [
    "beautiful",
    "allure"
  ],
  "aura sphere": [
    "dexterity",
    "channel"
  ],
  "aura wheel": [
    "dexterity",
    "brawl"
  ],
  "aurora beam": [
    "dexterity",
    "channel"
  ],
  "aurora veil": [
    "special",
    "channel"
  ],
  "autotomize": [
    "dexterity",
    "channel"
  ],
  "avalanche": [
    "dexterity",
    "brawl"
  ],
  "baby-doll eyes": [
    "cute",
    "allure"
  ],
  "baddy bad": [
    "dexterity",
    "channel"
  ],
  "baneful bunker": [
    "vitality",
    "nature"
  ],
  "barrage": [
    "dexterity",
    "brawl"
  ],
  "barrier": [
    "special",
    "channel"
  ],
  "baton pass": [
    "special",
    "channel"
  ],
  "beak blast": [
    "dexterity",
    "brawl"
  ],
  "beat up": [
    "dexterity",
    "brawl"
  ],
  "behemoth bash": [
    "vitality",
    "brawl"
  ],
  "behemoth blade": [
    "strength",
    "brawl"
  ],
  "belch": [
    "special",
    "channel"
  ],
  "belly drum": [
    "tough",
    "perform"
  ],
  "bestow": [
    "cool",
    "etiquette"
  ],
  "bide": [
    "dexterity",
    "brawl"
  ],
  "bind": [
    "dexterity",
    "brawl"
  ],
  "bite": [
    "dexterity",
    "brawl"
  ],
  "blast burn": [
    "special",
    "channel"
  ],
  "blaze kick": [
    "dexterity",
    "brawl"
  ],
  "blizzard": [
    "special",
    "channel"
  ],
  "block": [
    "dexterity",
    "brawl"
  ],
  "blue flare": [
    "special",
    "channel"
  ],
  "body press": [
    "strength",
    "brawl"
  ],
  "body slam": [
    "dexterity",
    "brawl"
  ],
  "bolt beak": [
    "dexterity",
    "brawl"
  ],
  "bolt strike": [
    "strength",
    "brawl"
  ],
  "bone club": [
    "dexterity",
    "brawl"
  ],
  "bone rush": [
    "dexterity",
    "brawl"
  ],
  "bonemerang": [
    "dexterity",
    "brawl"
  ],
  "boomburst": [
    "dexterity",
    "channel"
  ],
  "bounce": [
    "dexterity",
    "brawl"
  ],
  "bouncy bubble": [
    "dexterity",
    "channel"
  ],
  "branch poke": [
    "dexterity",
    "brawl"
  ],
  "brave bird": [
    "strength",
    "brawl"
  ],
  "breaking swipe": [
    "dexterity",
    "brawl"
  ],
  "brick break": [
    "dexterity",
    "brawl"
  ],
  "brine": [
    "dexterity",
    "channel"
  ],
  "brutal swing": [
    "dexterity",
    "brawl"
  ],
  "bubble": [
    "dexterity",
    "channel"
  ],
  "bubble beam": [
    "dexterity",
    "channel"
  ],
  "bug bite": [
    "dexterity",
    "brawl"
  ],
  "bug buzz": [
    "special",
    "perform"
  ],
  "bulk up": [
    "vitality",
    "athletic"
  ],
  "bulldoze": [
    "dexterity",
    "brawl"
  ],
  "bullet punch": [
    "dexterity",
    "brawl"
  ],
  "bullet seed": [
    "dexterity",
    "brawl"
  ],
  "burn up": [
    "will",
    "channel"
  ],
  "buzzy buzz": [
    "dexterity",
    "channel"
  ],
  "calm mind": [
    "insight",
    "channel"
  ],
  "camouflage": [
    "special",
    "nature"
  ],
  "captivate": [
    "beautiful",
    "allure"
  ],
  "charge": [
    "insight",
    "nature"
  ],
  "charge beam": [
    "dexterity",
    "channel"
  ],
  "charm": [
    "cute",
    "allure"
  ],
  "chatter": [
    "insight",
    "perform"
  ],
  "chip away": [
    "dexterity",
    "brawl"
  ],
  "circle throw": [
    "dexterity",
    "brawl"
  ],
  "clamp": [
    "dexterity",
    "brawl"
  ],
  "clanging scales": [
    "dexterity",
    "perform"
  ],
  "clangorous soul": [
    "tough",
    "perform"
  ],
  "clear smog": [
    "dexterity",
    "channel"
  ],
  "close combat": [
    "strength",
    "brawl"
  ],
  "coil": [
    "tough",
    "intimidate"
  ],
  "comet punch": [
    "dexterity",
    "brawl"
  ],
  "confide": [
    "cute",
    "allure"
  ],
  "confuse ray": [
    "insight",
    "nature"
  ],
  "confusion": [
    "dexterity",
    "channel"
  ],
  "constrict": [
    "dexterity",
    "brawl"
  ],
  "conversion": [
    "will",
    "channel"
  ],
  "conversion 2": [
    "will",
    "channel"
  ],
  "copycat": [
    null,
    null
  ],
  "core enforcer": [
    "special",
    "channel"
  ],
  "cosmic power": [
    "special",
    "channel"
  ],
  "cotton guard": [
    "insight",
    "channel"
  ],
  "cotton spore": [
    "insight",
    "channel"
  ],
  "counter": [
    "insight",
    "brawl"
  ],
  "court change": [
    "clever",
    "etiquette"
  ],
  "cover an ally": [
    null,
    null
  ],
  "covet": [
    "clever",
    "stealth"
  ],
  "crabhammer": [
    "dexterity",
    "brawl"
  ],
  "crafty shield": [
    "insight",
    "nature"
  ],
  "cross chop": [
    "dexterity",
    "brawl"
  ],
  "cross poison": [
    "dexterity",
    "brawl"
  ],
  "crunch": [
    "dexterity",
    "brawl"
  ],
  "crush claw": [
    "dexterity",
    "brawl"
  ],
  "crush grip": [
    "strength",
    "brawl"
  ],
  "curse": [
    "will",
    "channel"
  ],
  "curse (non-ghost user)": [
    "will",
    "channel"
  ],
  "cut": [
    "dexterity",
    "brawl"
  ],
  "dark pulse": [
    "insight",
    "channel"
  ],
  "dark void": [
    "insight",
    "channel"
  ],
  "darkest lariat": [
    "dexterity",
    "brawl"
  ],
  "dazzling gleam": [
    "dexterity",
    "channel"
  ],
  "decorate": [
    "beautiful",
    "nature"
  ],
  "defend order": [
    "tough",
    "nature"
  ],
  "defense curl": [
    "vitality",
    "brawl"
  ],
  "defog": [
    "insight",
    "nature"
  ],
  "destiny bond": [
    "will",
    "channel"
  ],
  "detect": [
    "insight",
    "alert"
  ],
  "diamond storm": [
    "dexterity",
    "channel"
  ],
  "dig": [
    "dexterity",
    "brawl"
  ],
  "disable": [
    "insight",
    "channel"
  ],
  "disarming voice": [
    "insight",
    "perform"
  ],
  "discharge": [
    "dexterity",
    "channel"
  ],
  "dive": [
    "dexterity",
    "brawl"
  ],
  "dizzy punch": [
    "dexterity",
    "brawl"
  ],
  "doom desire": [
    "insight",
    "allure"
  ],
  "double hit": [
    "dexterity",
    "brawl"
  ],
  "double iron bash": [
    "special",
    "channel"
  ],
  "double kick": [
    "dexterity",
    "brawl"
  ],
  "double slap": [
    "dexterity",
    "brawl"
  ],
  "double team": [
    "dexterity",
    "evasion"
  ],
  "double-edge": [
    "strength",
    "brawl"
  ],
  "draco meteor": [
    "special",
    "channel"
  ],
  "dragon ascent": [
    "strength",
    "brawl"
  ],
  "dragon breath": [
    "dexterity",
    "channel"
  ],
  "dragon claw": [
    "dexterity",
    "brawl"
  ],
  "dragon dance": [
    "tough",
    "perform"
  ],
  "dragon darts": [
    "dexterity",
    "channel"
  ],
  "dragon hammer": [
    "dexterity",
    "brawl"
  ],
  "dragon pulse": [
    "dexterity",
    "channel"
  ],
  "dragon rage": [
    "dexterity",
    "channel"
  ],
  "dragon rush": [
    "dexterity",
    "brawl"
  ],
  "dragon tail": [
    "dexterity",
    "brawl"
  ],
  "drain punch": [
    "dexterity",
    "brawl"
  ],
  "draining kiss": [
    "dexterity",
    "channel"
  ],
  "dream eater": [
    "special",
    "channel"
  ],
  "drill peck": [
    "dexterity",
    "brawl"
  ],
  "drill run": [
    "dexterity",
    "brawl"
  ],
  "drum beating": [
    "dexterity",
    "perform"
  ],
  "dual chop": [
    "dexterity",
    "brawl"
  ],
  "dynamax cannon": [
    "special",
    "channel"
  ],
  "dynamic punch": [
    "dexterity",
    "brawl"
  ],
  "earth power": [
    "dexterity",
    "channel"
  ],
  "earthquake": [
    "dexterity",
    "brawl"
  ],
  "echoed voice": [
    "dexterity",
    "channel"
  ],
  "eerie impulse": [
    "insight",
    "nature"
  ],
  "egg bomb": [
    "dexterity",
    "brawl"
  ],
  "electric terrain": [
    "insight",
    "nature"
  ],
  "electrify": [
    "insight",
    "nature"
  ],
  "electro ball": [
    "dexterity",
    "channel"
  ],
  "electroweb": [
    "dexterity",
    "channel"
  ],
  "embargo": [
    "tough",
    "intimidate"
  ],
  "ember": [
    "dexterity",
    "channel"
  ],
  "encore": [
    "cool",
    "allure"
  ],
  "endeavor": [
    "will",
    "channel"
  ],
  "endure": [
    "will",
    "channel"
  ],
  "energy ball": [
    "dexterity",
    "channel"
  ],
  "entrainment": [
    "cool",
    "perform"
  ],
  "eruption": [
    "special",
    "channel"
  ],
  "eternabeam": [
    "special",
    "channel"
  ],
  "explosion": [
    "strength",
    "brawl"
  ],
  "extrasensory": [
    "dexterity",
    "channel"
  ],
  "extreme speed": [
    "dexterity",
    "brawl"
  ],
  "facade": [
    "dexterity",
    "brawl"
  ],
  "fairy lock": [
    "insight",
    "nature"
  ],
  "fairy wind": [
    "dexterity",
    "channel"
  ],
  "fake out": [
    "dexterity",
    "brawl"
  ],
  "fake tears": [
    "cute",
    "perform"
  ],
  "false surrender": [
    "insight",
    "allure"
  ],
  "false swipe": [
    "dexterity",
    "brawl"
  ],
  "feather dance": [
    "beautiful",
    "perform"
  ],
  "feint": [
    "dexterity",
    "brawl"
  ],
  "feint attack": [
    "dexterity",
    "brawl"
  ],
  "fell stinger": [
    "dexterity",
    "brawl"
  ],
  "fiery dance": [
    "dexterity",
    "perform"
  ],
  "final gambit": [
    "will",
    "athletic"
  ],
  "fire blast": [
    "special",
    "channel"
  ],
  "fire fang": [
    "dexterity",
    "brawl"
  ],
  "fire lash": [
    "dexterity",
    "brawl"
  ],
  "fire pledge": [
    "dexterity",
    "channel"
  ],
  "fire punch": [
    "dexterity",
    "brawl"
  ],
  "fire spin": [
    "dexterity",
    "channel"
  ],
  "first impression": [
    "strength",
    "intimidate"
  ],
  "fishious rend": [
    "dexterity",
    "brawl"
  ],
  "fissure": [
    "strength",
    "brawl"
  ],
  "flail": [
    "dexterity",
    "brawl"
  ],
  "flame burst": [
    "dexterity",
    "channel"
  ],
  "flame charge": [
    "dexterity",
    "brawl"
  ],
  "flame wheel": [
    "dexterity",
    "brawl"
  ],
  "flamethrower": [
    "dexterity",
    "channel"
  ],
  "flare blitz": [
    "strength",
    "brawl"
  ],
  "flash": [
    "special",
    "channel"
  ],
  "flash cannon": [
    "dexterity",
    "channel"
  ],
  "flatter": [
    "cool",
    "allure"
  ],
  "fleur cannon": [
    "special",
    "channel"
  ],
  "fling": [
    "dexterity",
    "brawl"
  ],
  "floaty fall": [
    "dexterity",
    "brawl"
  ],
  "floral healing": [
    "insight",
    "nature"
  ],
  "flower shield": [
    "insight",
    "nature"
  ],
  "fly": [
    "dexterity",
    "brawl"
  ],
  "flying press": [
    "dexterity",
    "brawl"
  ],
  "focus blast": [
    "special",
    "channel"
  ],
  "focus energy": [
    "insight",
    "channel"
  ],
  "focus punch": [
    "strength",
    "brawl"
  ],
  "follow me": [
    "cool",
    "perform"
  ],
  "force palm": [
    "dexterity",
    "brawl"
  ],
  "foresight": [
    "insight",
    "alert"
  ],
  "forest's curse": [
    "will",
    "nature"
  ],
  "foul play": [
    "dexterity",
    "brawl"
  ],
  "freeze dry": [
    "dexterity",
    "channel"
  ],
  "freeze shock": [
    "special",
    "channel"
  ],
  "freezy frost": [
    "special",
    "channel"
  ],
  "frenzy plant": [
    "special",
    "channel"
  ],
  "frost breath": [
    "dexterity",
    "channel"
  ],
  "frustration": [
    "dexterity",
    "brawl"
  ],
  "fury attack": [
    "dexterity",
    "brawl"
  ],
  "fury cutter": [
    "dexterity",
    "brawl"
  ],
  "fury swipes": [
    "dexterity",
    "brawl"
  ],
  "fusion bolt": [
    "strength",
    "channel"
  ],
  "fusion flare": [
    "special",
    "channel"
  ],
  "future sight": [
    "insight",
    "channel"
  ],
  "gastro acid": [
    "special",
    "channel"
  ],
  "gear grind": [
    "dexterity",
    "brawl"
  ],
  "gear up": [
    "vitality",
    "channel"
  ],
  "geomancy": [
    "insight",
    "nature"
  ],
  "giga drain": [
    "dexterity",
    "channel"
  ],
  "giga impact": [
    "strength",
    "brawl"
  ],
  "glaciate": [
    "dexterity",
    "channel"
  ],
  "glare": [
    "tough",
    "intimidate"
  ],
  "glitzy glow": [
    "special",
    "channel"
  ],
  "grapple": [
    "strength",
    "brawl"
  ],
  "grass knot": [
    "dexterity",
    "channel"
  ],
  "grass pledge": [
    "dexterity",
    "channel"
  ],
  "grass whistle": [
    "special",
    "perform"
  ],
  "grassy terrain": [
    "special",
    "nature"
  ],
  "grav apple": [
    "dexterity",
    "channel"
  ],
  "gravity": [
    "special",
    "channel"
  ],
  "growl": [
    "tough/cute",
    "perform"
  ],
  "growl (cute)": [
    "cute",
    "perform"
  ],
  "growl (tough)": [
    "tough",
    "perform"
  ],
  "growth": [
    "special",
    "nature"
  ],
  "grudge": [
    "will",
    "channel"
  ],
  "guard split": [
    "special",
    "channel"
  ],
  "guard swap": [
    "special",
    "channel"
  ],
  "guillotine": [
    "dexterity",
    "brawl"
  ],
  "gunk shot": [
    "strength",
    "brawl"
  ],
  "gust": [
    "dexterity",
    "channel"
  ],
  "gyro ball": [
    "dexterity",
    "brawl"
  ],
  "hail": [
    "special",
    "nature"
  ],
  "hammer arm": [
    "dexterity",
    "brawl"
  ],
  "harden": [
    "vitality",
    "nature"
  ],
  "haze": [
    "special",
    "nature"
  ],
  "head charge": [
    "strength",
    "brawl"
  ],
  "head smash": [
    "strength",
    "brawl"
  ],
  "headbutt": [
    "dexterity",
    "brawl"
  ],
  "heal bell": [
    "special",
    "perform"
  ],
  "heal block": [
    "special",
    "channel"
  ],
  "heal order": [
    "tough",
    "nature"
  ],
  "heal pulse": [
    "will",
    "channel"
  ],
  "healing wish": [
    "will",
    "channel"
  ],
  "heart stamp": [
    "insight",
    "allure"
  ],
  "heart swap": [
    "insight",
    "allure"
  ],
  "heat crash": [
    "strength",
    "brawl"
  ],
  "heat wave": [
    "dexterity",
    "channel"
  ],
  "heavy slam": [
    "dexterity",
    "brawl"
  ],
  "help another": [
    null,
    null
  ],
  "helping hand": [
    "dexterity",
    "perform"
  ],
  "hex": [
    "dexterity",
    "channel"
  ],
  "hidden power": [
    null,
    null
  ],
  "high horsepower": [
    "dexterity",
    "brawl"
  ],
  "high jump kick": [
    "dexterity",
    "brawl"
  ],
  "hone claws": [
    "insight",
    "nature"
  ],
  "horn attack": [
    "dexterity",
    "brawl"
  ],
  "horn drill": [
    "dexterity",
    "brawl"
  ],
  "horn leech": [
    "dexterity",
    "brawl"
  ],
  "howl": [
    "cool",
    "intimidate"
  ],
  "hurricane": [
    "special",
    "channel"
  ],
  "hydro cannon": [
    "special",
    "channel"
  ],
  "hydro pump": [
    "special",
    "channel"
  ],
  "hyper beam": [
    "special",
    "channel"
  ],
  "hyper fang": [
    "dexterity",
    "brawl"
  ],
  "hyper voice": [
    "dexterity",
    "channel"
  ],
  "hyperspace fury": [
    "dexterity",
    "brawl"
  ],
  "hyperspace hole": [
    "insight",
    "channel"
  ],
  "hypnosis": [
    "insight",
    "allure"
  ],
  "ice ball": [
    "dexterity",
    "brawl"
  ],
  "ice beam": [
    "dexterity",
    "channel"
  ],
  "ice burn": [
    "special",
    "channel"
  ],
  "ice fang": [
    "dexterity",
    "brawl"
  ],
  "ice hammer": [
    "strength",
    "brawl"
  ],
  "ice punch": [
    "dexterity",
    "brawl"
  ],
  "ice shard": [
    "dexterity",
    "brawl"
  ],
  "icicle crash": [
    "dexterity",
    "brawl"
  ],
  "icicle spear": [
    "dexterity",
    "brawl"
  ],
  "icy wind": [
    "dexterity",
    "channel"
  ],
  "imprison": [
    "clever",
    "channel"
  ],
  "incinerate": [
    "dexterity",
    "channel"
  ],
  "inferno": [
    "dexterity",
    "channel"
  ],
  "infestation": [
    "dexterity",
    "channel"
  ],
  "ingrain": [
    "special",
    "nature"
  ],
  "instruct": [
    "clever",
    "perform"
  ],
  "ion deluge": [
    "insight",
    "nature"
  ],
  "iron defense": [
    "vitality",
    "channel"
  ],
  "iron head": [
    "dexterity",
    "brawl"
  ],
  "iron tail": [
    "dexterity",
    "brawl"
  ],
  "jaw lock": [
    "strength",
    "brawl"
  ],
  "judgment": [
    "insight",
    "intimidate"
  ],
  "jump kick": [
    "dexterity",
    "brawl"
  ],
  "karate chop": [
    "dexterity",
    "brawl"
  ],
  "kinesis": [
    "special",
    "channel"
  ],
  "king's shield": [
    "dexterity",
    "brawl"
  ],
  "knock off": [
    "dexterity",
    "brawl"
  ],
  "land's wrath": [
    "strength",
    "channel"
  ],
  "laser focus": [
    "insight",
    "alert"
  ],
  "last resort": [
    "dexterity",
    "brawl"
  ],
  "lava plume": [
    "dexterity",
    "channel"
  ],
  "leaf blade": [
    "dexterity",
    "brawl"
  ],
  "leaf storm": [
    "special",
    "channel"
  ],
  "leaf tornado": [
    "dexterity",
    "channel"
  ],
  "leafage": [
    "dexterity",
    "brawl"
  ],
  "leech life": [
    "dexterity",
    "brawl"
  ],
  "leech seed": [
    "special",
    "nature"
  ],
  "leer": [
    "tough",
    "intimidate"
  ],
  "lick": [
    "dexterity",
    "brawl"
  ],
  "life dew": [
    "special",
    "nature"
  ],
  "light of ruin": [
    "special",
    "channel"
  ],
  "light screen": [
    "special",
    "channel"
  ],
  "liquidation": [
    "strength",
    "brawl"
  ],
  "lock-on": [
    "insight",
    "alert"
  ],
  "lovely kiss": [
    null,
    null
  ],
  "low kick": [
    "dexterity",
    "brawl"
  ],
  "low sweep": [
    "dexterity",
    "brawl"
  ],
  "lucky chant": [
    "special",
    "perform"
  ],
  "lunar dance": [
    "insight",
    "perform"
  ],
  "lunge": [
    "dexterity",
    "brawl"
  ],
  "luster purge": [
    "special",
    "channel"
  ],
  "mach punch": [
    "dexterity",
    "brawl"
  ],
  "magic coat": [
    "special",
    "channel"
  ],
  "magic powder": [
    "special",
    "channel"
  ],
  "magic room": [
    "special",
    "channel"
  ],
  "magical leaf": [
    "dexterity",
    "channel"
  ],
  "magma storm": [
    "special",
    "channel"
  ],
  "magnet bomb": [
    "dexterity",
    "channel"
  ],
  "magnet rise": [
    "insight",
    "nature"
  ],
  "magnetic flux": [
    "insight",
    "nature"
  ],
  "magnitude": [
    "dexterity",
    "brawl"
  ],
  "mat block": [
    "dexterity",
    "athletic"
  ],
  "me first": [
    "dexterity",
    "brawl"
  ],
  "mean look": [
    "tough",
    "intimidate"
  ],
  "meditate": [
    "will",
    "channel"
  ],
  "mega drain": [
    "dexterity",
    "channel"
  ],
  "mega kick": [
    "dexterity",
    "brawl"
  ],
  "mega punch": [
    "dexterity",
    "brawl"
  ],
  "megahorn": [
    "strength",
    "brawl"
  ],
  "memento": [
    "will",
    "channel"
  ],
  "metal burst": [
    "dexterity",
    "brawl"
  ],
  "metal claw": [
    "dexterity",
    "brawl"
  ],
  "metal sound": [
    "tough",
    "perform"
  ],
  "meteor assault": [
    "strength",
    "brawl"
  ],
  "meteor mash": [
    "dexterity",
    "brawl"
  ],
  "metronome": [
    "dexterity",
    "perform"
  ],
  "milk drink": [
    "vitality",
    "nature"
  ],
  "mimic": [
    "clever",
    "perform"
  ],
  "mind blown": [
    "insight",
    "channel"
  ],
  "mind reader": [
    "insight",
    "channel"
  ],
  "minimize": [
    "special",
    "channel"
  ],
  "miracle eye": [
    "insight",
    "alert"
  ],
  "mirror coat": [
    "dexterity",
    "channel"
  ],
  "mirror move": [
    "will",
    "channel"
  ],
  "mirror shot": [
    "dexterity",
    "channel"
  ],
  "mist": [
    "special",
    "nature"
  ],
  "mist ball": [
    "special",
    "channel"
  ],
  "misty terrain": [
    "insight",
    "nature"
  ],
  "moonblast": [
    "special",
    "channel"
  ],
  "moongeist beam": [
    "special",
    "channel"
  ],
  "moonlight": [
    "insight",
    "nature"
  ],
  "morning sun": [
    "vitality",
    "nature"
  ],
  "mud bomb": [
    "dexterity",
    "channel"
  ],
  "mud shot": [
    "dexterity",
    "channel"
  ],
  "mud slap": [
    "dexterity",
    "channel"
  ],
  "mud sport": [
    "special",
    "nature"
  ],
  "muddy water": [
    "dexterity",
    "channel"
  ],
  "multi-attack": [
    "dexterity",
    "brawl"
  ],
  "mystical fire": [
    "dexterity",
    "channel"
  ],
  "nasty plot": [
    "clever",
    "alert"
  ],
  "natural gift": [
    "dexterity",
    "channel"
  ],
  "nature power": [
    "special",
    "nature"
  ],
  "nature's madness": [
    "insight",
    "nature"
  ],
  "needle arm": [
    "dexterity",
    "brawl"
  ],
  "night daze": [
    "dexterity",
    "channel"
  ],
  "night shade": [
    "insight",
    "channel"
  ],
  "night slash": [
    "dexterity",
    "brawl"
  ],
  "nightmare": [
    "will",
    "channel"
  ],
  "no retreat": [
    "insight",
    "nature"
  ],
  "noble roar": [
    "tough",
    "intimidate"
  ],
  "nuzzle": [
    "dexterity",
    "brawl"
  ],
  "oblivion wing": [
    "special",
    "channel"
  ],
  "obstruct": [
    "dexterity",
    "intimidate"
  ],
  "octazooka": [
    "dexterity",
    "channel"
  ],
  "octolock": [
    "strength",
    "brawl"
  ],
  "odor sleuth": [
    "insight",
    "alert"
  ],
  "ominous wind": [
    "dexterity",
    "channel"
  ],
  "origin pulse": [
    "special",
    "channel"
  ],
  "outrage": [
    "strength",
    "brawl"
  ],
  "overdrive": [
    "dexterity",
    "perform"
  ],
  "overheat": [
    "special",
    "channel"
  ],
  "pain split": [
    "will",
    "channel"
  ],
  "parabolic charge": [
    "dexterity",
    "channel"
  ],
  "parting shot": [
    "tough",
    "intimidate"
  ],
  "pay day": [
    "dexterity",
    "brawl"
  ],
  "payback": [
    "dexterity",
    "brawl"
  ],
  "peck": [
    "dexterity",
    "brawl"
  ],
  "perish song": [
    "beautiful",
    "perform"
  ],
  "petal blizzard": [
    "dexterity",
    "brawl"
  ],
  "petal dance": [
    "special",
    "channel"
  ],
  "phantom force": [
    "strength",
    "brawl"
  ],
  "photon geyser": [
    "dexterity",
    "channel"
  ],
  "photon geyser (physical)": [
    "dexterity",
    "channel"
  ],
  "photon geyser (special)": [
    "dexterity",
    "channel"
  ],
  "pika papow": [
    "dexterity",
    "channel"
  ],
  "pin missile": [
    "dexterity",
    "brawl"
  ],
  "plasma fists": [
    "dexterity",
    "brawl"
  ],
  "play nice": [
    "cute",
    "allure"
  ],
  "play rough": [
    "dexterity",
    "brawl"
  ],
  "pluck": [
    "dexterity",
    "brawl"
  ],
  "poison fang": [
    "dexterity",
    "brawl"
  ],
  "poison gas": [
    "special",
    "channel"
  ],
  "poison jab": [
    "dexterity",
    "brawl"
  ],
  "poison powder": [
    "special",
    "channel"
  ],
  "poison sting": [
    "dexterity",
    "channel"
  ],
  "poison tail": [
    "dexterity",
    "brawl"
  ],
  "pollen puff": [
    "special",
    "channel"
  ],
  "poltergeist": [
    "dexterity",
    "stealth"
  ],
  "pound": [
    "dexterity",
    "brawl"
  ],
  "powder": [
    "insight",
    "nature"
  ],
  "powder snow": [
    "dexterity",
    "channel"
  ],
  "power gem": [
    "dexterity",
    "channel"
  ],
  "power split": [
    "special",
    "channel"
  ],
  "power swap": [
    "special",
    "channel"
  ],
  "power trick": [
    "special",
    "channel"
  ],
  "power trip": [
    "dexterity",
    "brawl"
  ],
  "power whip": [
    "dexterity",
    "brawl"
  ],
  "power-up punch": [
    "dexterity",
    "brawl"
  ],
  "precipice blades": [
    "strength",
    "channel"
  ],
  "present": [
    "cute",
    "allure"
  ],
  "prismatic laser": [
    "dexterity",
    "channel"
  ],
  "protect": [
    "will",
    "channel"
  ],
  "psybeam": [
    "dexterity",
    "channel"
  ],
  "psych up": [
    "insight",
    "channel"
  ],
  "psychic": [
    "dexterity",
    "channel"
  ],
  "psychic fangs": [
    "dexterity",
    "brawl"
  ],
  "psychic terrain": [
    "special",
    "channel"
  ],
  "psycho boost": [
    "dexterity",
    "channel"
  ],
  "psycho cut": [
    "dexterity",
    "brawl"
  ],
  "psycho shift": [
    "clever",
    "channel"
  ],
  "psyshock": [
    "dexterity",
    "channel"
  ],
  "psystrike": [
    "dexterity",
    "channel"
  ],
  "psywave": [
    "insight",
    "channel"
  ],
  "punishment": [
    "dexterity",
    "brawl"
  ],
  "purify": [
    "special",
    "nature"
  ],
  "pursuit": [
    "dexterity",
    "brawl"
  ],
  "pyro ball": [
    "strength",
    "channel"
  ],
  "quash": [
    "tough",
    "intimidate"
  ],
  "quick attack": [
    "dexterity",
    "brawl"
  ],
  "quick guard": [
    "dexterity",
    "athletic"
  ],
  "quiver dance": [
    "beautiful",
    "perform"
  ],
  "rage": [
    "dexterity",
    "brawl"
  ],
  "rage powder": [
    "insight",
    "intimidate"
  ],
  "rain dance": [
    "special",
    "nature"
  ],
  "rapid spin": [
    "dexterity",
    "brawl"
  ],
  "razor leaf": [
    "dexterity",
    "brawl"
  ],
  "razor shell": [
    "dexterity",
    "brawl"
  ],
  "razor wind": [
    "dexterity",
    "channel"
  ],
  "recover": [
    "special",
    "nature"
  ],
  "recycle": [
    "vitality",
    "nature"
  ],
  "reflect": [
    "special",
    "channel"
  ],
  "reflect type": [
    "special",
    "channel"
  ],
  "refresh": [
    "will",
    "channel"
  ],
  "relic song": [
    "special",
    "perform"
  ],
  "rest": [
    "vitality",
    "nature"
  ],
  "retaliate": [
    "dexterity",
    "brawl"
  ],
  "return": [
    "dexterity",
    "brawl"
  ],
  "revelation dance": [
    "dexterity",
    "perform"
  ],
  "revenge": [
    "dexterity",
    "brawl"
  ],
  "reversal": [
    "dexterity",
    "brawl"
  ],
  "roar": [
    "tough",
    "intimidate"
  ],
  "roar of time": [
    "special",
    "channel"
  ],
  "rock blast": [
    "dexterity",
    "brawl"
  ],
  "rock climb": [
    "dexterity",
    "brawl"
  ],
  "rock polish": [
    "dexterity",
    "channel"
  ],
  "rock slide": [
    "dexterity",
    "brawl"
  ],
  "rock smash": [
    "dexterity",
    "brawl"
  ],
  "rock throw": [
    "dexterity",
    "channel"
  ],
  "rock tomb": [
    "dexterity",
    "channel"
  ],
  "rock wrecker": [
    "strength",
    "channel"
  ],
  "role play": [
    "clever",
    "perform"
  ],
  "rolling kick": [
    "dexterity",
    "brawl"
  ],
  "rollout": [
    "dexterity",
    "brawl"
  ],
  "roost": [
    "insight",
    "nature"
  ],
  "rototiller": [
    "special",
    "nature"
  ],
  "round": [
    "special",
    "perform"
  ],
  "run away": [
    "dexterity",
    "athletic"
  ],
  "sacred fire": [
    "dexterity",
    "channel"
  ],
  "sacred sword": [
    "dexterity",
    "brawl"
  ],
  "safeguard": [
    "special",
    "channel"
  ],
  "sand attack": [
    "dexterity",
    "channel"
  ],
  "sand tomb": [
    "dexterity",
    "brawl"
  ],
  "sandstorm": [
    "special",
    "nature"
  ],
  "sappy seed": [
    "special",
    "brawl"
  ],
  "scald": [
    "dexterity",
    "channel"
  ],
  "scary face": [
    "tough",
    "intimidate"
  ],
  "scratch": [
    "dexterity",
    "brawl"
  ],
  "screech": [
    "tough",
    "perform"
  ],
  "searing shot": [
    "special",
    "channel"
  ],
  "secret power": [
    "dexterity",
    "brawl"
  ],
  "secret sword": [
    "dexterity",
    "channel"
  ],
  "seed bomb": [
    "dexterity",
    "brawl"
  ],
  "seed flare": [
    "special",
    "channel"
  ],
  "seismic toss": [
    "strength",
    "athletic"
  ],
  "self destruct": [
    "strength",
    "brawl"
  ],
  "shadow ball": [
    "dexterity",
    "channel"
  ],
  "shadow bone": [
    "dexterity",
    "brawl"
  ],
  "shadow claw": [
    "dexterity",
    "brawl"
  ],
  "shadow force": [
    "strength",
    "brawl"
  ],
  "shadow punch": [
    "dexterity",
    "brawl"
  ],
  "shadow sneak": [
    "dexterity",
    "brawl"
  ],
  "sharpen": [
    "dexterity",
    "athletic"
  ],
  "sheer cold": [
    "special",
    "channel"
  ],
  "shell smash": [
    "strength",
    "brawl"
  ],
  "shell trap": [
    "dexterity",
    "stealth"
  ],
  "shift gear": [
    "dexterity",
    "channel"
  ],
  "shock wave": [
    "dexterity",
    "channel"
  ],
  "shore up": [
    "insight",
    "nature"
  ],
  "signal beam": [
    "special",
    "channel"
  ],
  "silver wind": [
    "dexterity",
    "channel"
  ],
  "simple beam": [
    "insight",
    "empathy"
  ],
  "sing": [
    "cute",
    "perform"
  ],
  "sizzly slide": [
    "dexterity",
    "brawl"
  ],
  "sketch": [
    "dexterity",
    "perform"
  ],
  "skill swap": [
    "clever",
    "perform"
  ],
  "skull bash": [
    "strength",
    "brawl"
  ],
  "sky attack": [
    "strength",
    "brawl"
  ],
  "sky drop": [
    "dexterity",
    "brawl"
  ],
  "sky uppercut": [
    "dexterity",
    "brawl"
  ],
  "slack off": [
    "vitality",
    "nature"
  ],
  "slam": [
    "dexterity",
    "brawl"
  ],
  "slash": [
    "dexterity",
    "brawl"
  ],
  "sleep powder": [
    "special",
    "nature"
  ],
  "sleep talk": [
    null,
    null
  ],
  "sludge": [
    "dexterity",
    "channel"
  ],
  "sludge bomb": [
    "dexterity",
    "channel"
  ],
  "sludge wave": [
    "dexterity",
    "channel"
  ],
  "smack down": [
    "dexterity",
    "channel"
  ],
  "smart strike": [
    "dexterity",
    "brawl"
  ],
  "smelling salts": [
    "dexterity",
    "brawl"
  ],
  "smog": [
    "dexterity",
    "channel"
  ],
  "smokescreen": [
    "special",
    "channel"
  ],
  "snap trap": [
    "dexterity",
    "stealth"
  ],
  "snarl": [
    "insight",
    "perform"
  ],
  "snatch": [
    "clever",
    "stealth"
  ],
  "snipe shot": [
    "dexterity",
    "channel"
  ],
  "snore": [
    "special",
    "perform"
  ],
  "soak": [
    "special",
    "channel"
  ],
  "soft boiled": [
    "insight",
    "nature"
  ],
  "solar beam": [
    "special",
    "channel"
  ],
  "solar blade": [
    "strength",
    "brawl"
  ],
  "sonic boom": [
    "dexterity",
    "channel"
  ],
  "spacial rend": [
    "special",
    "channel"
  ],
  "spark": [
    "dexterity",
    "brawl"
  ],
  "sparkling aria": [
    "special",
    "perform"
  ],
  "sparkly swirl": [
    "dexterity",
    "channel"
  ],
  "spectral thief": [
    "dexterity",
    "brawl"
  ],
  "speed swap": [
    "special",
    "channel"
  ],
  "spider web": [
    "insight",
    "stealth"
  ],
  "spike cannon": [
    "dexterity",
    "brawl"
  ],
  "spikes": [
    "special",
    "nature"
  ],
  "spiky shield": [
    "dexterity",
    "brawl"
  ],
  "spirit break": [
    "insight",
    "brawl"
  ],
  "spirit shackle": [
    "dexterity",
    "brawl"
  ],
  "spit up": [
    "dexterity",
    "channel"
  ],
  "spite": [
    "will",
    "intimidate"
  ],
  "splash": [
    "dexterity",
    "brawl"
  ],
  "splishy splash": [
    "dexterity",
    "channel"
  ],
  "spore": [
    "special",
    "nature"
  ],
  "spotlight": [
    "cool",
    "perform"
  ],
  "stabilize an ally": [
    "clever",
    "medicine"
  ],
  "stealth rock": [
    "dexterity",
    "stealth"
  ],
  "steam eruption": [
    "dexterity",
    "channel"
  ],
  "steamroller": [
    "dexterity",
    "brawl"
  ],
  "steel beam": [
    "special",
    "channel"
  ],
  "steel wing": [
    "dexterity",
    "brawl"
  ],
  "sticky web": [
    "insight",
    "nature"
  ],
  "stockpile": [
    "insight",
    "nature"
  ],
  "stomp": [
    "dexterity",
    "brawl"
  ],
  "stomping tantrum": [
    "dexterity",
    "brawl"
  ],
  "stone edge": [
    "strength",
    "channel"
  ],
  "stored power": [
    "dexterity",
    "channel"
  ],
  "storm throw": [
    "dexterity",
    "brawl"
  ],
  "strange steam": [
    "special",
    "channel"
  ],
  "strength": [
    "strength",
    "brawl"
  ],
  "strength sap": [
    "insight",
    "nature"
  ],
  "string shot": [
    "insight",
    "nature"
  ],
  "struggle": [
    "dexterity",
    "brawl/channel"
  ],
  "struggle (physical)": [
    "dexterity",
    "brawl"
  ],
  "struggle (special)": [
    "dexterity",
    "channel"
  ],
  "struggle bug": [
    "dexterity",
    "channel"
  ],
  "stuff cheeks": [
    "clever",
    "nature"
  ],
  "stun spore": [
    "special",
    "nature"
  ],
  "submission": [
    "dexterity",
    "brawl"
  ],
  "substitute": [
    "dexterity",
    "stealth"
  ],
  "sucker punch": [
    "dexterity",
    "brawl"
  ],
  "sunny day": [
    "special",
    "nature"
  ],
  "sunsteel strike": [
    "strength",
    "brawl"
  ],
  "super fang": [
    "dexterity",
    "brawl"
  ],
  "superpower": [
    "strength",
    "brawl"
  ],
  "supersonic": [
    "tough",
    "channel"
  ],
  "surf": [
    "dexterity",
    "channel"
  ],
  "swagger": [
    "tough",
    "intimidate"
  ],
  "swallow": [
    "vitality",
    "nature"
  ],
  "sweet kiss": [
    "cute",
    "allure"
  ],
  "sweet scent": [
    "special",
    "nature"
  ],
  "swift": [
    "dexterity",
    "channel"
  ],
  "switcheroo": [
    "insight",
    "stealth"
  ],
  "swords dance": [
    "dexterity",
    "perform"
  ],
  "synchronoise": [
    "special",
    "perform"
  ],
  "synthesis": [
    "special",
    "nature"
  ],
  "tackle": [
    "dexterity",
    "brawl"
  ],
  "tail glow": [
    "insight",
    "nature"
  ],
  "tail slap": [
    "dexterity",
    "brawl"
  ],
  "tail whip": [
    "cute",
    "perform"
  ],
  "tailwind": [
    "insight",
    "nature"
  ],
  "take down": [
    "dexterity",
    "brawl"
  ],
  "tar shot": [
    "special",
    "channel"
  ],
  "taunt": [
    "tough",
    "intimidate"
  ],
  "tearful look": [
    "cute",
    "allure"
  ],
  "teatime": [
    "insight",
    "etiquette"
  ],
  "techno blast": [
    "dexterity",
    "channel"
  ],
  "teeter dance": [
    "dexterity",
    "perform"
  ],
  "telekinesis": [
    "special",
    "channel"
  ],
  "teleport": [
    "special",
    "channel"
  ],
  "thief": [
    "dexterity",
    "brawl"
  ],
  "thousand arrows": [
    "strength",
    "channel"
  ],
  "thousand waves": [
    "special",
    "brawl"
  ],
  "thrash": [
    "strength",
    "brawl"
  ],
  "throat chop": [
    "dexterity",
    "brawl"
  ],
  "thunder": [
    "special",
    "channel"
  ],
  "thunder fang": [
    "dexterity",
    "brawl"
  ],
  "thunder punch": [
    "dexterity",
    "brawl"
  ],
  "thunder shock": [
    "dexterity",
    "channel"
  ],
  "thunder wave": [
    "insight",
    "nature"
  ],
  "thunderbolt": [
    "dexterity",
    "channel"
  ],
  "tickle": [
    "dexterity",
    "brawl"
  ],
  "topsy-turvy": [
    "tough",
    "intimidate"
  ],
  "torment": [
    "tough",
    "intimidate"
  ],
  "toxic": [
    "special",
    "channel"
  ],
  "toxic spikes": [
    "dexterity",
    "stealth"
  ],
  "toxic thread": [
    "dexterity",
    "channel"
  ],
  "transform": [
    "will",
    "channel"
  ],
  "tri attack": [
    "dexterity",
    "channel"
  ],
  "trick": [
    "special",
    "allure"
  ],
  "trick room": [
    "special",
    "channel"
  ],
  "trick-or-treat": [
    "will",
    "allure"
  ],
  "triple kick": [
    "dexterity",
    "brawl"
  ],
  "trop kick": [
    "dexterity",
    "brawl"
  ],
  "trump card": [
    "will",
    "channel"
  ],
  "twineedle": [
    "dexterity",
    "brawl"
  ],
  "twister": [
    "dexterity",
    "channel"
  ],
  "u-turn": [
    "dexterity",
    "brawl"
  ],
  "uproar": [
    "dexterity",
    "channel"
  ],
  "v-create": [
    "strength",
    "brawl"
  ],
  "vacuum wave": [
    "dexterity",
    "channel"
  ],
  "veevee volley": [
    "dexterity",
    "brawl"
  ],
  "venom drench": [
    "special",
    "channel"
  ],
  "venoshock": [
    "dexterity",
    "channel"
  ],
  "vice grip": [
    "dexterity",
    "brawl"
  ],
  "vine whip": [
    "dexterity",
    "brawl"
  ],
  "vital throw": [
    "dexterity",
    "brawl"
  ],
  "volt switch": [
    "dexterity",
    "channel"
  ],
  "volt tackle": [
    "strength",
    "brawl"
  ],
  "wake-up slap": [
    "dexterity",
    "brawl"
  ],
  "water gun": [
    "dexterity",
    "channel"
  ],
  "water pledge": [
    "dexterity",
    "channel"
  ],
  "water pulse": [
    "dexterity",
    "channel"
  ],
  "water shuriken": [
    "dexterity",
    "channel"
  ],
  "water sport": [
    "special",
    "channel"
  ],
  "water spout": [
    "dexterity",
    "channel"
  ],
  "waterfall": [
    "dexterity",
    "brawl"
  ],
  "weather ball": [
    "dexterity",
    "nature"
  ],
  "whirlpool": [
    "dexterity",
    "channel"
  ],
  "whirlwind": [
    "dexterity",
    "nature"
  ],
  "wide guard": [
    "vitality",
    "brawl"
  ],
  "wild charge": [
    "dexterity",
    "brawl"
  ],
  "will-o-wisp": [
    "dexterity",
    "channel"
  ],
  "wing attack": [
    "dexterity",
    "brawl"
  ],
  "wish": [
    "will",
    "channel"
  ],
  "withdraw": [
    "vitality",
    "brawl"
  ],
  "wonder room": [
    "special",
    "channel"
  ],
  "wood hammer": [
    "strength",
    "brawl"
  ],
  "work up": [
    "strength",
    "athletic"
  ],
  "worry seed": [
    "special",
    "nature"
  ],
  "wrap": [
    "dexterity",
    "brawl"
  ],
  "wring out": [
    "strength",
    "brawl"
  ],
  "x-scissor": [
    "strength",
    "brawl"
  ],
  "yawn": [
    "special",
    "channel"
  ],
  "zap cannon": [
    "dexterity",
    "channel"
  ],
  "zen headbutt": [
    "dexterity",
    "brawl"
  ],
  "zing zap": [
    "dexterity",
    "brawl"
  ],
  "zippy zap": [
    "dexterity",
    "brawl"
  ]
};

export function correctedMoveAccuracy(move: { name: string; accuracy_stat: string | null; accuracy_skill: string | null }) {
  const pair = MOVE_ACCURACY_CORRECTIONS[move.name.trim().toLowerCase()];
  return pair ? { accuracy_stat: pair[0], accuracy_skill: pair[1] } : move;
}

function normalizeMoveSkillName(value: string): string {
  // Imported book text sometimes includes a trailing OCR "e" or punctuation.
  return value.trim().toLowerCase().replace(/[.]+$/, "").replace(/\s+e$/, "").trim();
}

export function moveNeedsAccuracyChoice(move: { name: string; accuracy_stat: string | null; accuracy_skill: string | null }): boolean {
  const accuracy = correctedMoveAccuracy(move);
  const attrs = [...POKEMON_ATTRS, ...SOCIAL_ATTRS, "will", "beauty"] as readonly string[];
  return !accuracy.accuracy_stat || !accuracy.accuracy_skill ||
    !accuracy.accuracy_stat.toLowerCase().split("/").every(v => attrs.includes(v.trim())) ||
    !accuracy.accuracy_skill.split("/").every(v => {
      const name = normalizeMoveSkillName(v);
      return name === "athletics" || SKILLS.some(s => s.toLowerCase() === name);
    });
}

export function moveAccuracyPool(
  move: { name: string; accuracy_stat: string | null; accuracy_skill: string | null },
  attrValue: (name: string) => number,
  skills: Record<string, number> | null | undefined,
): { pool: number; label: string } {
  if (moveNeedsAccuracyChoice(move)) return { pool: 0, label: "Pool a definir" };
  const accuracy = correctedMoveAccuracy(move);
  const choices = accuracy.accuracy_stat!.toLowerCase().split("/").map(v => v.trim().replace(/^beauty$/, "beautiful"));
  const best = choices.reduce((a, b) => attrValue(b) > attrValue(a) ? b : a);
  const skill = resolveSkillValue(accuracy.accuracy_skill, skills);
  return { pool: attrValue(best) + skill.value, label: `${best.charAt(0).toUpperCase() + best.slice(1)} + ${skill.label}` };
}

export function resolveSkillValue(
  skillNameFromDb: string | null | undefined,
  skillMap: Record<string, number> | null | undefined,
): { value: number; label: string } {
  if (!skillNameFromDb) return { value: 0, label: "" };
  skillMap ??= {};
  const parts = skillNameFromDb.split("/").map((p) => p.trim()).filter(Boolean);
  let best: { value: number; label: string } | null = null;
  for (const p of parts) {
    const normalized = normalizeMoveSkillName(p);
    const acceptedNames = SKILL_NAME_ALIASES[normalized] ?? [normalized];
    const key = Object.keys(skillMap).find((k) => acceptedNames.includes(normalizeMoveSkillName(k)));
    const v = key ? (skillMap[key] ?? 0) : 0;
    const canonical = SKILLS.find((name) => acceptedNames.includes(name.toLowerCase()));
    const label = canonical ?? (normalized.charAt(0).toUpperCase() + normalized.slice(1));
    if (!best || v > best.value) best = { value: v, label };
  }
  return best ?? { value: 0, label: skillNameFromDb };
}

// Shiny helpers — 10% chance (roll 1d100, 1–10 = shiny).
export const SHINY_CHANCE_PERCENT = 10;
export function rollShiny(): boolean {
  return Math.floor(Math.random() * 100) + 1 <= SHINY_CHANCE_PERCENT;
}
// Convert a PokeAPI sprite URL to its shiny variant.
// e.g. .../sprites/pokemon/25.png -> .../sprites/pokemon/shiny/25.png
export function shinyize(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes("/pokemon/shiny/")) return url;
  return url.replace("/sprites/pokemon/", "/sprites/pokemon/shiny/");
}

export type PokemonSpriteStyle = "pixel" | "3d";

const REGIONAL_FORM_ALIASES: Record<string, string> = {
  alolan: "alola",
  alola: "alola",
  galarian: "galar",
  galar: "galar",
  hisuian: "hisui",
  hisui: "hisui",
  paldean: "paldea",
  paldea: "paldea",
};

// Showdown has animated sprites for these forms, but no gen5-style pixel
// sprite yet. Pixel mode falls back to the correct animated form instead of
// showing a broken image or the base Pokemon.
const ANIMATED_FALLBACK_FOR_PIXEL_FORMS = new Set([
  "barbaracle-mega",
  "dragalge-mega",
  "eelektross-mega",
  "falinks-mega",
  "malamar-mega",
  "pyroar-mega",
  "raichu-megax",
  "raichu-megay",
  "scolipede-mega",
  "scrafty-mega",
  "staraptor-mega",
]);

const FORMS_WITHOUT_SHOWDOWN_SPRITES = new Set([
  "absol-megaz",
  "baxcalibur-mega",
  "darkrai-mega",
  "garchomp-megaz",
  "golisopod-mega",
  "heatran-mega",
  "lucario-megaz",
  "magearna-mega",
  "magearna-original-mega",
  "tatsugiri-curly-mega",
  "tatsugiri-droopy-mega",
  "tatsugiri-stretchy-mega",
  "zeraora-mega",
  "zygarde-mega",
]);

const SHOWDOWN_FORM_SLUG_ALIASES: Record<string, string> = {
  // Showdown separates Meowstic's male and female Mega files. Until sex is
  // part of the species name, use the male sprite as the stable default.
  "meowstic-mega": "meowstic-mmega",
};

function normalizePokemonSlugText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/mr\./g, "mr")
    .replace(/farfetch['’]d/g, "farfetchd")
    .replace(/sirfetch['’]d/g, "sirfetchd")
    .replace(/nidoran\s*[♀]/g, "nidoran-f")
    .replace(/nidoran\s*[♂]/g, "nidoran-m")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function pokemonFormSlug(speciesName: string | null | undefined): string | null {
  if (!speciesName) return null;
  const name = speciesName.trim();
  if (!name) return null;
  const megaMatch = name.match(/\((?:(Original Color|Curly|Droopy|Stretchy)\s+)?Mega(?:\s+(X|Y|Z))?\s+Form\)/i);
  if (megaMatch) {
    const base = normalizePokemonSlugText(name.replace(megaMatch[0], ""));
    const variant = megaMatch[1]
      ? normalizePokemonSlugText(megaMatch[1].replace(/\bcolor\b/i, ""))
      : megaMatch[2]?.toLowerCase();
    if (!base) return null;
    const slug = variant && megaMatch[1]
      ? `${base}-${variant}-mega`
      : `${base}-mega${variant ?? ""}`;
    return SHOWDOWN_FORM_SLUG_ALIASES[slug] ?? slug;
  }
  const regionMatch = name.match(/\((Alolan|Galarian|Hisuian|Paldean)\s+Form\)/i);
  if (regionMatch) {
    const region = REGIONAL_FORM_ALIASES[regionMatch[1].toLowerCase()];
    const base = normalizePokemonSlugText(name.replace(regionMatch[0], ""));
    return base && region ? `${base}-${region}` : null;
  }
  const trailingRegion = name.match(/\b(Alolan|Alola|Galarian|Galar|Hisuian|Hisui|Paldean|Paldea)\b/i);
  if (trailingRegion) {
    const region = REGIONAL_FORM_ALIASES[trailingRegion[1].toLowerCase()];
    const base = normalizePokemonSlugText(name.replace(trailingRegion[0], "").replace(/\bform\b/gi, ""));
    return base && region ? `${base}-${region}` : null;
  }
  return null;
}

export function pokemonSpriteSlug(speciesName: string | null | undefined): string | null {
  if (!speciesName) return null;
  const formSlug = pokemonFormSlug(speciesName);
  if (formSlug) return formSlug;
  const normalized = normalizePokemonSlugText(
    speciesName
      .replace(/\(([^)]*)\)/g, " $1 ")
      .replace(/\bform\b/gi, " "),
  );
  return normalized || null;
}

export function formSpriteUrl(
  speciesName: string | null | undefined,
  shiny = false,
  style: PokemonSpriteStyle = "pixel",
): string | null {
  const slug = style === "3d" ? pokemonSpriteSlug(speciesName) : pokemonFormSlug(speciesName);
  if (!slug) return null;
  if (FORMS_WITHOUT_SHOWDOWN_SPRITES.has(slug)) return null;
  if (style === "pixel" && ANIMATED_FALLBACK_FOR_PIXEL_FORMS.has(slug)) {
    return `https://play.pokemonshowdown.com/sprites/ani/${slug}.gif`;
  }
  const folder = style === "3d" ? (shiny ? "ani-shiny" : "ani") : (shiny ? "gen5-shiny" : "gen5");
  const ext = style === "3d" ? "gif" : "png";
  return `https://play.pokemonshowdown.com/sprites/${folder}/${slug}.${ext}`;
}

export function preferredPokemonSprite(
  speciesName: string | null | undefined,
  spriteUrl: string | null | undefined,
  shiny = false,
  style: PokemonSpriteStyle = "pixel",
): string | null {
  const formSprite = formSpriteUrl(speciesName, shiny, style);
  if (formSprite) return formSprite;
  if (shiny) return shinyize(spriteUrl) ?? spriteUrl ?? null;
  return spriteUrl ?? null;
}

export function pokemonSpriteCandidates(
  speciesName: string | null | undefined,
  spriteUrl: string | null | undefined,
  shiny = false,
  style: PokemonSpriteStyle = "pixel",
  customUrl?: string | null,
): string[] {
  const sources: Array<string | null | undefined> = [];
  if (customUrl) sources.push(customUrl);

  const slug = pokemonSpriteSlug(speciesName);
  if (style === "pixel" && slug) {
    sources.push(
      `https://play.pokemonshowdown.com/sprites/${shiny ? "gen5ani-shiny" : "gen5ani"}/${slug}.gif`,
    );
  }

  sources.push(preferredPokemonSprite(speciesName, spriteUrl, shiny, style));

  const baseFallback = shiny ? (shinyize(spriteUrl) ?? spriteUrl) : spriteUrl;
  sources.push(baseFallback);

  return Array.from(new Set(sources.filter((source): source is string => !!source)));
}


/* ============================================================
 * Defensive type effectiveness (Gen 6+ chart)
 * ============================================================ */
const TYPE_CHART_DEF: Partial<Record<PokemonType, Partial<Record<PokemonType, number>>>> = {
  normal:   { fighting: 2, ghost: 0 },
  fire:     { fire: 0.5, water: 2, grass: 0.5, ice: 0.5, ground: 2, bug: 0.5, rock: 2, steel: 0.5, fairy: 0.5 },
  water:    { fire: 0.5, water: 0.5, electric: 2, grass: 2, ice: 0.5, steel: 0.5 },
  electric: { electric: 0.5, ground: 2, flying: 0.5, steel: 0.5 },
  grass:    { fire: 2, water: 0.5, electric: 0.5, grass: 0.5, ice: 2, poison: 2, ground: 0.5, flying: 2, bug: 2 },
  ice:      { fire: 2, ice: 0.5, fighting: 2, rock: 2, steel: 2 },
  fighting: { flying: 2, psychic: 2, bug: 0.5, rock: 0.5, dark: 0.5, fairy: 2 },
  poison:   { grass: 0.5, fighting: 0.5, poison: 0.5, ground: 2, psychic: 2, bug: 0.5, fairy: 0.5 },
  ground:   { water: 2, electric: 0, grass: 2, ice: 2, poison: 0.5, rock: 0.5 },
  flying:   { electric: 2, grass: 0.5, ice: 2, fighting: 0.5, ground: 0, bug: 0.5, rock: 2 },
  psychic:  { fighting: 0.5, psychic: 0.5, bug: 2, ghost: 2, dark: 2 },
  bug:      { fire: 2, grass: 0.5, fighting: 0.5, ground: 0.5, flying: 2, rock: 2 },
  rock:     { normal: 0.5, fire: 0.5, water: 2, grass: 2, fighting: 2, poison: 0.5, ground: 2, flying: 0.5, steel: 2 },
  ghost:    { normal: 0, fighting: 0, poison: 0.5, bug: 0.5, ghost: 2, dark: 2 },
  dragon:   { fire: 0.5, water: 0.5, electric: 0.5, grass: 0.5, ice: 2, dragon: 2, fairy: 2 },
  dark:     { fighting: 2, psychic: 0, bug: 2, ghost: 0.5, dark: 0.5, fairy: 2 },
  steel:    { normal: 0.5, fire: 2, grass: 0.5, ice: 0.5, fighting: 2, poison: 0, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 0.5, ghost: 0.5, dragon: 0.5, steel: 0.5, fairy: 0.5 },
  fairy:    { fighting: 0.5, poison: 2, bug: 0.5, dragon: 0, dark: 0.5, steel: 2 },
  typeless: {},
};

export type TypeEffectiveness = {
  weak2: PokemonType[];   // 4x  → +2 dano
  weak1: PokemonType[];   // 2x  → +1 dano
  resist1: PokemonType[]; // 0.5x → -1 dano
  resist2: PokemonType[]; // 0.25x → -2 dano
  immune: PokemonType[];  // 0
};

export function computeDefensiveEffectiveness(defTypes: string[]): TypeEffectiveness {
  const types = defTypes
    .map((t) => String(t).toLowerCase() as PokemonType)
    .filter((t) => (POKEMON_TYPES as readonly string[]).includes(t));
  const result: TypeEffectiveness = { weak2: [], weak1: [], resist1: [], resist2: [], immune: [] };
  for (const atk of POKEMON_TYPES) {
    if (atk === "typeless") continue;
    let mult = 1;
    for (const def of types) {
      const m = TYPE_CHART_DEF[def]?.[atk];
      if (m !== undefined) mult *= m;
    }
    if (mult === 0) result.immune.push(atk);
    else if (mult >= 4) result.weak2.push(atk);
    else if (mult >= 2) result.weak1.push(atk);
    else if (mult <= 0.25) result.resist2.push(atk);
    else if (mult <= 0.5) result.resist1.push(atk);
  }
  return result;
}

/** Damage multiplier of a single attacking type vs combined defender types. */
export function damageMultiplierFor(moveType: string, defenderTypes: string[]): number {
  const atk = String(moveType).toLowerCase() as PokemonType;
  if (!(POKEMON_TYPES as readonly string[]).includes(atk)) return 1;
  const defs = defenderTypes
    .map((t) => String(t).toLowerCase() as PokemonType)
    .filter((t) => (POKEMON_TYPES as readonly string[]).includes(t));
  let mult = 1;
  for (const def of defs) {
    const m = TYPE_CHART_DEF[def]?.[atk];
    if (m !== undefined) mult *= m;
  }
  return mult;
}

/** Translate a defensive multiplier into a Pokérole damage delta. */
export function damageDeltaFromMultiplier(mult: number): { delta: number; label: string; immune: boolean } {
  if (mult === 0) return { delta: 0, label: "Imune", immune: true };
  if (mult >= 4) return { delta: 2, label: "Super efetivo +2", immune: false };
  if (mult >= 2) return { delta: 1, label: "Super efetivo +1", immune: false };
  if (mult <= 0.25) return { delta: -2, label: "Não efetivo -2", immune: false };
  if (mult <= 0.5) return { delta: -1, label: "Não efetivo -1", immune: false };
  return { delta: 0, label: "Neutro", immune: false };
}
