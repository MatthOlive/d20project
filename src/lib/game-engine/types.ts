export type EngineSystemId = "pokerole" | "t20" | "lancer" | string;

export type EngineStatus = "setup" | "running" | "paused" | "finished";
export type EnginePhase = "initiative" | "turns" | "complete";

export type EngineParticipantKind = "pokemon" | "trainer" | "t20" | "lancer" | "npc";

export type EngineParticipant = {
  id: string;
  tokenId: string | null;
  characterId: string | null;
  kind: EngineParticipantKind;
  ownerId: string | null;
  name: string;
  imageUrl: string | null;
  initiative: number | null;
  initiativePool: number;
  initiativeModifier: number;
  actionsUsed: number;
  resources: Record<string, number>;
  metadata: Record<string, unknown>;
};

export type EngineLastMove = {
  participantId: string;
  name: string;
  successes: number;
  rolledAt: string;
};

export type EngineState = {
  schemaVersion: 1;
  systemId: EngineSystemId;
  status: EngineStatus;
  phase: EnginePhase;
  pageId: string | null;
  round: number;
  turnIndex: number;
  participants: EngineParticipant[];
  lastMove?: EngineLastMove | null;
  settings: {
    manualAdvance: boolean;
    allowPlayerControl: boolean;
  };
  createdAt: string;
};

export type EngineCommand =
  | {
      type: "set_initiative";
      participantId: string;
      value: number;
      detail?: Record<string, unknown>;
    }
  | { type: "start_turns" }
  | {
      type: "record_action";
      participantId: string;
      participantName?: string;
      actionType: string;
      label?: string;
      resultSuccesses?: number;
    }
  | { type: "advance_turn" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "finish" };

export type EngineSession = {
  id: string;
  game_id: string;
  page_id: string | null;
  system_id: string;
  status: EngineStatus;
  version: number;
  state: EngineState;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type EngineEvent = {
  id: number;
  session_id: string;
  game_id: string;
  version: number;
  actor_user_id: string;
  command: EngineCommand["type"] | "start_session";
  payload: Record<string, unknown>;
  created_at: string;
};

export type EngineActor = {
  userId: string;
  isNarrator: boolean;
};

export type InitiativeRoll = {
  value: number;
  label: string;
  detail: Record<string, unknown>;
};

export type EngineRulePack = {
  id: EngineSystemId;
  label: string;
  initiativeLabel: string;
  actionTypes: { id: string; label: string }[];
  rollInitiative: (participant: EngineParticipant) => InitiativeRoll;
  actionHint: (participant: EngineParticipant) => string;
};
