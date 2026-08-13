import type { Rank } from "@/lib/pokerole";

export type VictoryRank = Rank | "champion";
export type VictoryOpponentKind = "wild" | "trainer";

const VICTORY_RANKS: VictoryRank[] = [
  "starter",
  "beginner",
  "amateur",
  "ace",
  "pro",
  "champion",
  "master",
];

const BASE_VICTORIES: Record<VictoryRank, number> = {
  starter: 1,
  beginner: 2,
  amateur: 3,
  ace: 4,
  pro: 5,
  champion: 6,
  master: 7,
};

const RANK_ALIASES: Record<string, VictoryRank> = {
  starter: "starter",
  iniciante: "starter",
  beginner: "beginner",
  begginer: "beginner",
  novato: "beginner",
  amateur: "amateur",
  amador: "amateur",
  ace: "ace",
  pro: "pro",
  professional: "pro",
  profissional: "pro",
  champion: "champion",
  campeao: "champion",
  master: "master",
  mestre: "master",
};

export type ClassicVictoryReward = {
  amount: number;
  base: number;
  opponentPokemonRank: VictoryRank;
  comparedPlayerRank: VictoryRank;
  comparedOpponentRank: VictoryRank;
  rankDifference: number;
  factor: number;
  operation: "same" | "multiply" | "divide";
};

export type ClassicTrainerMoneyReward = {
  amount: number;
  base: number;
  operation: "gain" | "loss";
  playerTrainerRank: VictoryRank;
  opponentTrainerRank: VictoryRank;
  rankDifference: number;
  differenceMultiplier: number;
};

const TRAINER_WIN_MULTIPLIER: Record<VictoryRank, number> = {
  starter: 1,
  beginner: 2,
  amateur: 3,
  ace: 4,
  pro: 5,
  champion: 6,
  master: 7,
};

const TRAINER_LOSS_AMOUNT: Record<VictoryRank, number> = {
  starter: 30,
  beginner: 150,
  amateur: 300,
  ace: 600,
  pro: 1500,
  champion: 3000,
  master: 6000,
};

export function normalizeVictoryRank(value: unknown): VictoryRank {
  const normalized = String(value ?? "starter")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return RANK_ALIASES[normalized] ?? "starter";
}

function rankDifference(opponent: VictoryRank, player: VictoryRank) {
  return VICTORY_RANKS.indexOf(opponent) - VICTORY_RANKS.indexOf(player);
}

function trainerFactor(distance: number) {
  if (distance <= 0) return 1;
  if (distance === 1) return 1.2;
  if (distance === 2) return 1.5;
  return 2;
}

export function calculateClassicVictoryReward(input: {
  opponentPokemonRank: unknown;
  playerPokemonRank: unknown;
  opponentKind: VictoryOpponentKind;
  playerTrainerRank?: unknown;
  opponentTrainerRank?: unknown;
}): ClassicVictoryReward {
  const opponentPokemonRank = normalizeVictoryRank(input.opponentPokemonRank);
  const playerPokemonRank = normalizeVictoryRank(input.playerPokemonRank);
  const playerTrainerRank = normalizeVictoryRank(input.playerTrainerRank ?? playerPokemonRank);
  const opponentTrainerRank = normalizeVictoryRank(input.opponentTrainerRank ?? playerTrainerRank);
  const comparedPlayerRank = input.opponentKind === "trainer" ? playerTrainerRank : playerPokemonRank;
  const comparedOpponentRank = input.opponentKind === "trainer" ? opponentTrainerRank : opponentPokemonRank;
  const difference = rankDifference(comparedOpponentRank, comparedPlayerRank);
  const base = BASE_VICTORIES[opponentPokemonRank];

  if (difference === 0) {
    return {
      amount: Math.max(1, base),
      base,
      opponentPokemonRank,
      comparedPlayerRank,
      comparedOpponentRank,
      rankDifference: difference,
      factor: 1,
      operation: "same",
    };
  }

  const factor = input.opponentKind === "wild"
    ? Math.pow(1.2, Math.abs(difference))
    : trainerFactor(Math.abs(difference));
  const amount = difference > 0
    ? Math.ceil(base * factor)
    : Math.floor(base / factor);

  return {
    amount: Math.max(1, amount),
    base,
    opponentPokemonRank,
    comparedPlayerRank,
    comparedOpponentRank,
    rankDifference: difference,
    factor,
    operation: difference > 0 ? "multiply" : "divide",
  };
}

export function calculateClassicTrainerMoney(input: {
  winner: "player" | "opponent";
  playerTrainerRank: unknown;
  opponentTrainerRank: unknown;
}): ClassicTrainerMoneyReward {
  const playerTrainerRank = normalizeVictoryRank(input.playerTrainerRank);
  const opponentTrainerRank = normalizeVictoryRank(input.opponentTrainerRank);
  const difference = rankDifference(opponentTrainerRank, playerTrainerRank);
  const differenceMultiplier = Math.abs(difference) > 1 ? 2 : 1;
  const base = input.winner === "player"
    ? 300 * TRAINER_WIN_MULTIPLIER[opponentTrainerRank]
    : TRAINER_LOSS_AMOUNT[playerTrainerRank];

  return {
    amount: base * differenceMultiplier,
    base,
    operation: input.winner === "player" ? "gain" : "loss",
    playerTrainerRank,
    opponentTrainerRank,
    rankDifference: difference,
    differenceMultiplier,
  };
}
