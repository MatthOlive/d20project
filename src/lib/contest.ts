// Pokérole Contest helpers — reaction deck + training table + contest ranks

export type ReactionCard = {
  id: string;
  name: string;
  defaultWeight: number; // percent (sum of all = 100)
  hearts: number;        // hearts gained (negative = lost)
  description: string;
};

// Deck of reaction cards drawn during a Contest scene.
// Booing is not a card — it triggers when a performance fails.
export const REACTION_DECK: ReactionCard[] = [
  { id: "bored",    name: "Bored Yawns",   defaultWeight: 0,  hearts: -2, description: "The public is bored, some are even leaving. Lose 2 Hearts." },
  { id: "silence",  name: "Silence",       defaultWeight: 40, hearts: -1, description: "You can hear crickets and someone coughing. Lose 1 Heart." },
  { id: "smiles",   name: "Smiles",        defaultWeight: 25, hearts: 0,  description: "They are amused… but maybe they are expecting more? No effect." },
  { id: "clapping", name: "Clapping",      defaultWeight: 20, hearts: 1,  description: "A round of applause, they are having a good time! Gain 1 Heart." },
  { id: "loud",     name: "Loud Cheering", defaultWeight: 10, hearts: 2,  description: "They loved the performance, some rise to cheer! Gain 2 Hearts." },
  { id: "awe",      name: "Sheer Awe",     defaultWeight: 5,  hearts: 2,  description: "A few seconds of silence then a roar of cheering, whistling and tears of excitement. Gain 2 Hearts and 2 extra Confidence points." },
];

export const BOOING_CARD = {
  id: "booing",
  name: "Booing",
  hearts: -2,
  description: "You failed to score the required successes. Draw 2 Mishap Cards and lose 2 Hearts.",
} as const;

export function defaultContestWeights(): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of REACTION_DECK) m[c.id] = c.defaultWeight;
  return m;
}

export function drawReactionCard(weights: Record<string, number> | null | undefined): ReactionCard {
  const w = weights && Object.keys(weights).length > 0 ? weights : defaultContestWeights();
  const entries = REACTION_DECK.map((c) => ({ card: c, weight: Math.max(0, w[c.id] ?? c.defaultWeight) }));
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return REACTION_DECK[2]; // Smiles fallback
  let roll = Math.random() * total;
  for (const e of entries) {
    if (roll < e.weight) return e.card;
    roll -= e.weight;
  }
  return entries[entries.length - 1].card;
}

// =============== Contest ranks ===============
export const CONTEST_RANKS = ["", "coordinator", "super", "hyper", "master"] as const;
export type ContestRank = (typeof CONTEST_RANKS)[number];

export const CONTEST_RANK_LABELS: Record<ContestRank, string> = {
  "": "No Rank",
  coordinator: "Coordinator",
  super: "Super Coordinator",
  hyper: "Hyper Coordinator",
  master: "Master Coordinator",
};

// Requirements to reach the NEXT contest rank.
export const CONTEST_RANK_UP: Record<string, { label: string; items: string[] }> = {
  coordinator: {
    label: "Coordinator",
    items: ["Be among the first 3 places in a Normal Contest"],
  },
  super: {
    label: "Super Coordinator",
    items: [
      "Be among the first 3 places in a Super Contest",
      "At least 3 of your Pokémon must have a Normal Contest Ribbon",
    ],
  },
  hyper: {
    label: "Hyper Coordinator",
    items: [
      "Be among the first 3 places in a Hyper Contest",
      "At least 3 of your Pokémon must have a Super Contest Ribbon",
    ],
  },
  master: {
    label: "Master Coordinator",
    items: [
      "Be among the first 3 places in a Master Contest",
      "At least 3 of your Pokémon must have a Hyper Contest Ribbon",
    ],
  },
};

export const NEXT_CONTEST_RANK: Record<string, string> = {
  "": "coordinator",
  coordinator: "super",
  super: "hyper",
  hyper: "master",
};

// =============== Notoriety skills ===============
export const NOTORIETY_SKILLS = ["Fame", "Supporters", "Connections", "Sponsors"] as const;
export type NotorietySkill = (typeof NOTORIETY_SKILLS)[number];
export const NOTORIETY_CAP = 5;

// =============== Training table ===============
// Successful training sessions required at each rank to reach the next rank.
export const TRAININGS_PER_RANK: Record<string, number> = {
  starter: 3,
  beginner: 6,
  amateur: 12,
  ace: 24,
  pro: 36,
  master: 48,
};

// Re-trainings allowed (always visible, capped at this value).
export const RETRAIN_CAP = 3;
