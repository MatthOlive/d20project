import type {
  EngineActor,
  EngineCommand,
  EngineParticipant,
  EngineState,
  EngineSystemId,
} from "@/lib/game-engine/types";

function cloneState(state: EngineState): EngineState {
  return JSON.parse(JSON.stringify(state)) as EngineState;
}

export function createEngineState({
  systemId,
  pageId,
  participants,
}: {
  systemId: EngineSystemId;
  pageId: string | null;
  participants: EngineParticipant[];
}): EngineState {
  return {
    schemaVersion: 1,
    systemId,
    status: "setup",
    phase: "initiative",
    pageId,
    round: 0,
    turnIndex: 0,
    lastMove: null,
    participants: participants.map((participant) => ({
      ...participant,
      initiative: null,
      actionsUsed: 0,
    })),
    settings: {
      manualAdvance: true,
      allowPlayerControl: true,
    },
    createdAt: new Date().toISOString(),
  };
}

export function currentEngineParticipant(state: EngineState): EngineParticipant | null {
  if (state.phase !== "turns" || state.participants.length === 0) return null;
  return state.participants[state.turnIndex] ?? null;
}

export function engineParticipantControllerIds(participant: EngineParticipant): string[] {
  const stored = participant.metadata.controllerIds;
  const controllerIds = Array.isArray(stored)
    ? stored.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
  return [...new Set([participant.ownerId, ...controllerIds].filter((entry): entry is string => !!entry))];
}

export function mayControlEngineParticipant(
  participant: EngineParticipant | null,
  actor: EngineActor,
): boolean {
  return !!participant && (
    actor.isNarrator || engineParticipantControllerIds(participant).includes(actor.userId)
  );
}

function initiativeGroup(participant: EngineParticipant, systemId: EngineSystemId): number {
  if (systemId === "digirole") {
    if (participant.kind === "digirole_digimon") return 0;
    if (participant.kind === "digirole_tamer") return 1;
  }
  if (participant.kind === "pokemon") return 0;
  if (participant.kind === "trainer") return 1;
  return 0;
}

export function applyEngineCommand(
  state: EngineState,
  command: EngineCommand,
  actor: EngineActor,
): EngineState {
  const next = cloneState(state);

  if (command.type === "set_initiative") {
    if (next.phase !== "initiative")
      throw new Error("A iniciativa deste encontro já foi encerrada.");
    const participant = next.participants.find((entry) => entry.id === command.participantId);
    if (!participant) throw new Error("Participante não encontrado no encontro.");
    if (!mayControlEngineParticipant(participant, actor))
      throw new Error("Você não controla este participante.");
    participant.initiative = Math.trunc(command.value);
    return next;
  }

  if (command.type === "start_turns") {
    if (!actor.isNarrator) throw new Error("Somente o narrador pode iniciar os turnos.");
    if (next.participants.length === 0) throw new Error("Adicione participantes antes de iniciar.");
    next.participants.sort((left, right) => {
      const groupDifference = initiativeGroup(left, next.systemId) - initiativeGroup(right, next.systemId);
      if (groupDifference) return groupDifference;
      const initiativeDifference = (right.initiative ?? -9999) - (left.initiative ?? -9999);
      return initiativeDifference || left.name.localeCompare(right.name, "pt-BR");
    });
    next.participants.forEach((participant) => {
      participant.actionsUsed = 0;
      participant.metadata.actions = [];
      participant.metadata.lastActionType = null;
      participant.metadata.lastActionLabel = null;
    });
    next.status = "running";
    next.phase = "turns";
    next.round = 1;
    next.turnIndex = 0;
    return next;
  }

  if (command.type === "record_action") {
    if (next.status !== "running") throw new Error("O encontro precisa estar em andamento.");
    const participant = next.participants.find((entry) => entry.id === command.participantId);
    if (!participant) throw new Error("Participante não encontrado no encontro.");
    if (!mayControlEngineParticipant(participant, actor))
      throw new Error("Você não controla este participante.");
    const label = command.label?.trim() || null;
    const previousActions = Array.isArray(participant.metadata.actions)
      ? participant.metadata.actions
      : [];
    participant.actionsUsed += 1;
    participant.metadata.actions = [
      ...previousActions,
      {
        type: command.actionType,
        label,
        recordedAt: new Date().toISOString(),
      },
    ];
    participant.metadata.lastActionType = command.actionType;
    participant.metadata.lastActionLabel = label;
    if (typeof command.resultSuccesses === "number") {
      participant.metadata.lastActionSuccesses = Math.max(0, Math.trunc(command.resultSuccesses));
    }
    if (command.actionType === "move" && typeof command.resultSuccesses === "number") {
      next.lastMove = {
        participantId: participant.id,
        name: label ?? "Move",
        successes: Math.max(0, Math.trunc(command.resultSuccesses)),
        rolledAt: new Date().toISOString(),
      };
    }
    return next;
  }

  if (command.type === "advance_turn") {
    if (next.status !== "running") throw new Error("O encontro precisa estar em andamento.");
    const current = currentEngineParticipant(next);
    if (!mayControlEngineParticipant(current, actor))
      throw new Error("Somente o participante atual ou o narrador pode passar o turno.");
    if (next.participants.length === 0) return next;
    const wrapped = next.turnIndex >= next.participants.length - 1;
    next.turnIndex = wrapped ? 0 : next.turnIndex + 1;
    if (wrapped) next.round += 1;
    const nextParticipant = next.participants[next.turnIndex];
    const trainerKind = next.systemId === "digirole" ? "digirole_tamer" : "trainer";
    const hasTrainer = next.participants.some((participant) => participant.kind === trainerKind);
    const completedTrainerPhase = current?.kind === trainerKind && nextParticipant.kind !== trainerKind;
    const resetSharedActions =
      (next.systemId === "pokerole" || next.systemId === "digirole") &&
      (completedTrainerPhase || (!hasTrainer && wrapped));
    if (resetSharedActions) {
      next.participants.forEach((participant) => {
        participant.actionsUsed = 0;
        participant.metadata.actions = [];
        participant.metadata.lastActionType = null;
        participant.metadata.lastActionLabel = null;
        participant.metadata.lastActionSuccesses = null;
      });
      next.lastMove = null;
    } else if (next.systemId !== "pokerole" && next.systemId !== "digirole") {
      nextParticipant.actionsUsed = 0;
      nextParticipant.metadata.actions = [];
      nextParticipant.metadata.lastActionType = null;
      nextParticipant.metadata.lastActionLabel = null;
      nextParticipant.metadata.lastActionSuccesses = null;
    }
    return next;
  }

  if (command.type === "pause") {
    if (!actor.isNarrator) throw new Error("Somente o narrador pode pausar o motor.");
    if (next.status !== "running") throw new Error("O encontro não está em andamento.");
    next.status = "paused";
    return next;
  }

  if (command.type === "resume") {
    if (!actor.isNarrator) throw new Error("Somente o narrador pode retomar o motor.");
    if (next.status !== "paused") throw new Error("O encontro não está pausado.");
    next.status = "running";
    return next;
  }

  if (command.type === "finish") {
    if (!actor.isNarrator) throw new Error("Somente o narrador pode encerrar o encontro.");
    next.status = "finished";
    next.phase = "complete";
    return next;
  }

  return next;
}

export function engineCommandPayload(command: EngineCommand): Record<string, unknown> {
  return { ...command };
}
