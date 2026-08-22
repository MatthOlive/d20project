import type { EngineParticipantKind } from "@/lib/game-engine/types";

export const ENGINE_ACTION_ROLLED_EVENT = "d20-engine-action-rolled";

export type EngineReactionResolution = {
  kind: "clash" | "evade";
  moveName: string;
  moveSuccesses: number;
  actionsBefore: number;
  requiredSuccesses: number;
  rolledSuccesses: number;
  succeeded: boolean;
};

export type EngineActionRolledDetail = {
  gameId: string;
  tokenId?: string | null;
  characterId: string;
  characterKind: EngineParticipantKind;
  actionType: "move" | "reaction";
  label: string;
  resultSuccesses?: number;
};

export function emitEngineActionRolled(detail: EngineActionRolledDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<EngineActionRolledDetail>(ENGINE_ACTION_ROLLED_EVENT, {
    detail,
  }));
}
