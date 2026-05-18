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
  "Empathy", "Survival",
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

// /roll syntax: "5", "5d6", optional label
export function parseRollCommand(input: string): { n: number; label?: string } | null {
  const m = input.trim().match(/^\/roll\s+(\d+)(?:d6)?(?:\s+(.+))?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { n, label: m[2]?.trim() };
}
