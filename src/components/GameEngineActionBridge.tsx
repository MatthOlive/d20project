import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useGameEngine } from "@/hooks/use-game-engine";
import {
  ENGINE_ACTION_ROLLED_EVENT,
  type EngineActionRolledDetail,
} from "@/lib/game-engine/action-events";
import { engineParticipantControllerIds } from "@/lib/game-engine/core";
import type { EngineSession } from "@/lib/game-engine/types";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? error);
  }
  return String(error);
}

export function GameEngineActionBridge({
  gameId,
  userId,
  isNarrator,
}: {
  gameId: string;
  userId: string;
  isNarrator: boolean;
}) {
  const engine = useGameEngine({ gameId, actor: { userId, isNarrator } });
  const sessionRef = useRef<EngineSession | null>(engine.session);
  const commitRef = useRef(engine.commit);
  const refreshRef = useRef(engine.refresh);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    sessionRef.current = engine.session;
    commitRef.current = engine.commit;
    refreshRef.current = engine.refresh;
  }, [engine.commit, engine.refresh, engine.session]);

  useEffect(() => {
    async function record(detail: EngineActionRolledDetail) {
      let session = sessionRef.current;
      const sessionAcceptsEvent = (candidate: EngineSession | null) =>
        detail.actionType === "initiative"
          ? candidate?.state.phase === "initiative"
          : candidate?.status === "running" && candidate.state.phase === "turns";
      if (!sessionAcceptsEvent(session)) {
        session = await refreshRef.current();
        sessionRef.current = session;
      }
      if (!session || !sessionAcceptsEvent(session)) return;

      const matching = session.state.participants.filter(
        (participant) =>
          participant.characterId === detail.characterId && participant.kind === detail.characterKind,
      );
      const current = session.state.participants[session.state.turnIndex] ?? null;
      const participant =
        matching.find((entry) => detail.tokenId && entry.tokenId === detail.tokenId) ??
        matching.find((entry) => entry.id === current?.id) ??
        matching.find((entry) => engineParticipantControllerIds(entry).includes(userId)) ??
        null;

      if (!participant || !engineParticipantControllerIds(participant).includes(userId)) return;

      const command = detail.actionType === "initiative"
        ? {
            type: "set_initiative" as const,
            participantId: participant.id,
            value: Math.trunc(detail.resultSuccesses ?? 0),
            detail: { label: detail.label },
          }
        : {
            type: "record_action" as const,
            participantId: participant.id,
            participantName: participant.name,
            actionType: detail.actionType,
            label: detail.label,
            resultSuccesses: detail.resultSuccesses,
          };
      const updated = await commitRef.current(command);
      sessionRef.current = updated;
    }

    function onActionRolled(event: Event) {
      const detail = (event as CustomEvent<EngineActionRolledDetail>).detail;
      if (!detail || detail.gameId !== gameId) return;
      queueRef.current = queueRef.current
        .then(() => record(detail))
        .catch((error) => {
          toast.error("A rolagem foi enviada, mas o Motor não registrou a ação.", {
            description: messageOf(error),
          });
        });
    }

    window.addEventListener(ENGINE_ACTION_ROLLED_EVENT, onActionRolled);
    return () => window.removeEventListener(ENGINE_ACTION_ROLLED_EVENT, onActionRolled);
  }, [gameId, userId]);

  return null;
}
