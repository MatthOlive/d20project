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
export function resolveSkillValue(
  skillNameFromDb: string | null | undefined,
  skillMap: Record<string, number> | null | undefined,
): { value: number; label: string } {
  if (!skillNameFromDb) return { value: 0, label: "" };
  if (!skillMap) return { value: 0, label: skillNameFromDb };
  const parts = skillNameFromDb.split("/").map((p) => p.trim()).filter(Boolean);
  let best: { value: number; label: string } | null = null;
  for (const p of parts) {
    const key = Object.keys(skillMap).find((k) => k.toLowerCase() === p.toLowerCase());
    const v = key ? (skillMap[key] ?? 0) : 0;
    const label = key ?? (p.charAt(0).toUpperCase() + p.slice(1));
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


