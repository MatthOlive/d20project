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
  let name = speciesName.trim();
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




