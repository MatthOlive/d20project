import { RANKS, type Rank } from "@/lib/pokerole";

export const CLASSIC_REGIONS = [
  { id: "kanto", label: "Kanto", available: true },
  { id: "johto", label: "Johto", available: false },
  { id: "hoenn", label: "Hoenn", available: false },
  { id: "sinnoh", label: "Sinnoh", available: false },
  { id: "unova", label: "Unova", available: false },
  { id: "kalos", label: "Kalos", available: false },
  { id: "alola", label: "Alola", available: false },
  { id: "galar", label: "Galar", available: false },
  { id: "paldea", label: "Paldea", available: false },
  { id: "hisui", label: "Hisui", available: false },
  { id: "lumiose_za", label: "Lumiose Z-A", available: false },
] as const;

export type ClassicRegionId = (typeof CLASSIC_REGIONS)[number]["id"];

export const CLASSIC_START_CITIES: Record<ClassicRegionId, { id: string; label: string }[]> = {
  kanto: [{ id: "pallet", label: "Pallet" }],
  johto: [],
  hoenn: [],
  sinnoh: [],
  unova: [],
  kalos: [],
  alola: [],
  galar: [],
  paldea: [],
  hisui: [],
  lumiose_za: [],
};

export const KANTO_STORY_STEPS = [
  {
    id: "meet_professor",
    location: "Pallet",
    title: "Encontre o Professor",
    description: "Vá ao laboratório de Pallet com seu novo parceiro.",
    action: "Chegar ao laboratório",
  },
  {
    id: "leave_pallet",
    location: "Pallet",
    title: "Prepare a jornada",
    description: "Organize seu time e siga pela saída norte de Pallet.",
    action: "Partir para a Rota 1",
  },
  {
    id: "route_1",
    location: "Rota 1",
    title: "Atravesse a Rota 1",
    description: "Siga a estrada até Viridian. O grupo viaja e enfrenta os eventos previstos desta rota.",
    action: "Chegar a Viridian",
  },
  {
    id: "viridian_arrival",
    location: "Viridian",
    title: "Primeiros passos em Viridian",
    description: "Explore a cidade e prepare-se para as próximas rotas de Kanto.",
    action: "Concluir protótipo",
  },
  {
    id: "prototype_complete",
    location: "Viridian",
    title: "Protótipo concluído",
    description: "O início Pallet → Viridian está completo. A próxima etapa adicionará rotas, eventos e ginásios.",
    action: null,
  },
] as const;

export type KantoStoryStepId = (typeof KANTO_STORY_STEPS)[number]["id"];

export function rankCapForBadgeCount(badgeCount: number): Rank {
  if (badgeCount <= 0) return "beginner";
  if (badgeCount <= 2) return "amateur";
  if (badgeCount <= 4) return "ace";
  if (badgeCount <= 6) return "pro";
  return "master";
}

export function canUsePokemonRank(rank: Rank, badgeCount: number): boolean {
  return RANKS.indexOf(rank) <= RANKS.indexOf(rankCapForBadgeCount(badgeCount));
}

export function countRegionBadges(
  regionalBadges: Record<string, unknown> | null | undefined,
  region: ClassicRegionId,
): number {
  const value = regionalBadges?.[region];
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number") return Math.max(0, Math.floor(value));
  return 0;
}

export function gymEncounterScale(playerCount: number, challengerBadgeCount: number) {
  const players = Math.max(1, Math.min(8, Math.floor(playerCount)));
  const badges = Math.max(0, Math.min(8, Math.floor(challengerBadgeCount)));
  return {
    tier: badges,
    opposingPokemon: Math.max(2, Math.min(6, players + (badges >= 4 ? 1 : 0))),
    reservePokemon: Math.max(0, players - 2),
  };
}
