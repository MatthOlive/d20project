import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Shield, Swords } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { rollD6 } from "@/lib/pokerole";
import { emitEngineActionRolled } from "@/lib/game-engine/action-events";
import type { EngineParticipant, EngineSession } from "@/lib/game-engine/types";
import type {
  MoveReactionResponse,
  MoveReactionTarget,
  MoveRollMessage,
  MoveRollTarget,
} from "@/components/MoveCard";

type FlowMessage = {
  id: string;
  game_id: string;
  user_id: string;
  kind: string;
  body: string;
  roll_data: MoveRollMessage | MoveReactionResponse | Record<string, unknown> | null;
  created_at: string;
};

type PendingReaction = {
  source: FlowMessage;
  move: MoveRollMessage;
  target: MoveReactionTarget;
};

function isMoveMessage(value: FlowMessage["roll_data"]): value is MoveRollMessage {
  return !!value && value.v === "move-1";
}

function isReactionMessage(value: FlowMessage["roll_data"]): value is MoveReactionResponse {
  return !!value && value.v === "move-reaction-1";
}

function participantForTarget(session: EngineSession | null, target: MoveReactionTarget) {
  if (!session || session.status !== "running" || session.state.phase !== "turns") return null;
  return session.state.participants.find((participant) =>
    (participant.tokenId && participant.tokenId === target.tokenId) ||
    (participant.characterId === target.characterId && participant.kind === target.characterKind),
  ) ?? null;
}

function adjustedDamageTargets(
  targets: MoveRollTarget[] | undefined,
  responses: MoveReactionResponse[],
): MoveRollTarget[] | undefined {
  if (!targets) return undefined;
  const byRequest = new Map(responses.map((response) => [response.requestId, response]));
  return targets.map((target) => {
    const response = target.requestId ? byRequest.get(target.requestId) : null;
    if (target.immune) return { ...target, finalDamage: 0 };
    if (!response?.succeeded) return { ...target, finalDamage: Math.max(1, target.finalDamage) };
    if (response.choice === "evade") return { ...target, finalDamage: 0 };
    if (response.choice === "clash") return { ...target, finalDamage: 1 };
    return { ...target, finalDamage: Math.max(1, target.finalDamage) };
  });
}

async function applyDamageToTarget(
  queryClient: QueryClient,
  gameId: string,
  target: Pick<MoveReactionTarget, "characterId" | "characterKind">,
  damage: number,
) {
  const amount = Math.max(0, Math.floor(damage));
  if (amount === 0) return;

  if (target.characterKind === "pokemon") {
    const { data: current, error: readError } = await supabase
      .from("pokemon")
      .select("current_hp,hp")
      .eq("id", target.characterId)
      .single();
    if (readError) throw readError;
    const currentHp = current.current_hp ?? current.hp ?? 0;
    const nextHp = Math.max(0, currentHp - amount);
    const { data: saved, error: updateError } = await supabase
      .from("pokemon")
      .update({ current_hp: nextHp })
      .eq("id", target.characterId)
      .select("current_hp")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!saved) throw new Error("Você não tem permissão para aplicar dano a esta ficha.");
    const mergeHp = (old: Record<string, unknown> | undefined) => old ? { ...old, current_hp: nextHp } : old;
    queryClient.setQueriesData({ queryKey: ["token-pokemon", target.characterId] }, mergeHp);
    queryClient.setQueryData(["token-pokemon-stats", target.characterId], mergeHp);
    queryClient.setQueryData(["pokemon", target.characterId], mergeHp);
  } else {
    const { data: current, error: readError } = await supabase
      .from("trainers")
      .select("current_hp,attr_points,attr_bonus")
      .eq("id", target.characterId)
      .single();
    if (readError) throw readError;
    const attrPoints = (current.attr_points ?? {}) as Record<string, number>;
    const attrBonus = (current.attr_bonus ?? {}) as Record<string, number>;
    const maxHp = 5 + (attrPoints.vitality ?? 0) + (attrBonus.vitality ?? 0);
    const currentHp = current.current_hp ?? maxHp;
    const nextHp = Math.max(0, currentHp - amount);
    const { data: saved, error: updateError } = await supabase
      .from("trainers")
      .update({ current_hp: nextHp })
      .eq("id", target.characterId)
      .select("current_hp")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!saved) throw new Error("Você não tem permissão para aplicar dano a esta ficha.");
    const mergeHp = (old: Record<string, unknown> | undefined) => old ? { ...old, current_hp: nextHp } : old;
    queryClient.setQueriesData({ queryKey: ["token-trainer", target.characterId] }, mergeHp);
    queryClient.setQueryData(["token-trainer-stats", target.characterId], mergeHp);
    queryClient.setQueryData(["trainer", target.characterId], mergeHp);
  }

  void queryClient.invalidateQueries({ queryKey: ["mrd-target-info", gameId] });
}

export function MoveReactionCoordinator({
  gameId,
  userId,
}: {
  gameId: string;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const finalizingRef = useRef(new Set<string>());

  const { data: messages = [] } = useQuery({
    queryKey: ["chat", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return ((data ?? []) as FlowMessage[]).reverse();
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`move-reactions:${gameId}:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const incoming = payload.new as FlowMessage;
          queryClient.setQueryData<FlowMessage[]>(["chat", gameId], (old) => {
            if ((old ?? []).some((message) => message.id === incoming.id)) return old ?? [];
            return [...(old ?? []), incoming].slice(-250);
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, queryClient, userId]);

  const reactionByRequest = useMemo(() => {
    const map = new Map<string, MoveReactionResponse>();
    for (const message of messages) {
      if (!isReactionMessage(message.roll_data)) continue;
      if (!map.has(message.roll_data.requestId)) map.set(message.roll_data.requestId, message.roll_data);
    }
    return map;
  }, [messages]);

  const resolvedIds = useMemo(() => new Set(
    messages.flatMap((message) =>
      isMoveMessage(message.roll_data) && message.roll_data.phase === "resolution" && message.roll_data.resolutionId
        ? [message.roll_data.resolutionId]
        : [],
    ),
  ), [messages]);

  const pendingReaction = useMemo<PendingReaction | null>(() => {
    for (const source of messages) {
      if (!isMoveMessage(source.roll_data)) continue;
      const move = source.roll_data;
      if (move.phase !== "accuracy" || !move.resolutionId || resolvedIds.has(move.resolutionId)) continue;
      if (move.accuracy.isHit === false) continue;
      for (const target of move.reactionTargets ?? []) {
        if (!target.controllerIds.includes(userId)) continue;
        if (reactionByRequest.has(target.requestId)) continue;
        return { source, move, target };
      }
    }
    return null;
  }, [messages, reactionByRequest, resolvedIds, userId]);

  useEffect(() => {
    for (const source of messages) {
      if (source.user_id !== userId || !isMoveMessage(source.roll_data)) continue;
      const move = source.roll_data;
      const resolutionId = move.resolutionId;
      if (move.phase !== "accuracy" || !resolutionId || resolvedIds.has(resolutionId)) continue;
      if (finalizingRef.current.has(resolutionId)) continue;
      const targets = move.reactionTargets ?? [];
      if (move.accuracy.isHit === false || targets.length === 0) continue;
      const responses = targets.map((target) => reactionByRequest.get(target.requestId)).filter(Boolean) as MoveReactionResponse[];
      if (responses.length !== targets.length) continue;

      finalizingRef.current.add(resolutionId);
      const damage = move.damage
        ? { ...move.damage, targets: adjustedDamageTargets(move.damage.targets, responses) }
        : null;
      const attackerDamage = responses.reduce(
        (total, response) => total + (response.choice === "clash" && response.succeeded ? 1 : 0),
        0,
      );
      void (async () => {
        const { error } = await supabase.from("chat_messages").insert({
          game_id: gameId,
          user_id: userId,
          kind: "move",
          body: `${move.pokemonName} used ${move.card.name} · Damage & Effects`,
          roll_data: {
            ...move,
            phase: "resolution",
            damage,
            reactions: responses,
          } as unknown as never,
        });
        if (error) {
          finalizingRef.current.delete(resolutionId);
          toast.error(`As reações terminaram, mas o dano não pôde ser publicado: ${error.message}`);
          return;
        }

        const attacker = move.attacker;
        if (
          attackerDamage > 0 &&
          attacker?.characterId &&
          (attacker.characterKind === "pokemon" || attacker.characterKind === "trainer")
        ) {
          try {
            await applyDamageToTarget(queryClient, gameId, {
              characterId: attacker.characterId,
              characterKind: attacker.characterKind,
            }, attackerDamage);
          } catch (damageError) {
            toast.error(`O Clash foi registrado, mas o dano em ${move.pokemonName} não pôde ser aplicado: ${damageError instanceof Error ? damageError.message : String(damageError)}`);
          }
        }
      })();
    }
  }, [gameId, messages, queryClient, reactionByRequest, resolvedIds, userId]);

  async function respond(choice: MoveReactionResponse["choice"]) {
    if (!pendingReaction || submitting) return;
    const { move, target } = pendingReaction;
    if (!move.resolutionId) return;
    setSubmitting(true);
    try {
      const session = queryClient.getQueryData<EngineSession | null>(["game-engine-session", gameId]) ?? null;
      const participant: EngineParticipant | null = participantForTarget(session, target);
      const actionsBefore = Math.max(0, participant?.actionsUsed ?? 0);
      const moveSuccesses = Math.max(0, move.accuracy.successes);
      const required = moveSuccesses + actionsBefore;
      const rawPool = choice === "clash" ? target.clashPool : choice === "evade" ? target.evadePool : 0;
      const pool = Math.max(0, rawPool - target.painPenalty);
      if (choice !== "none" && pool < required) {
        toast.error(`A pool precisa ter pelo menos ${required} dado(s) para esta reação.`);
        return;
      }
      const rolled = choice === "none" ? { dice: [] as number[], successes: 0 } : rollD6(pool);
      const response: MoveReactionResponse = {
        v: "move-reaction-1",
        resolutionId: move.resolutionId,
        requestId: target.requestId,
        targetTokenId: target.tokenId,
        targetCharacterId: target.characterId,
        targetCharacterKind: target.characterKind,
        targetName: target.name,
        choice,
        pool,
        dice: rolled.dice,
        successes: rolled.successes,
        moveSuccesses,
        actionsBefore,
        required,
        succeeded: choice !== "none" && rolled.successes >= required,
      };
      const rawDamageTarget = move.damage?.targets?.find((damageTarget) =>
        damageTarget.requestId === target.requestId || damageTarget.tokenId === target.tokenId,
      );
      const resolvedDamageTarget = rawDamageTarget
        ? adjustedDamageTargets([rawDamageTarget], [response])?.[0]
        : null;
      response.appliedDamage = Math.max(0, resolvedDamageTarget?.finalDamage ?? 0);
      response.attackerDamage = choice === "clash" && response.succeeded ? 1 : 0;
      const { error } = await supabase.from("chat_messages").insert({
        game_id: gameId,
        user_id: userId,
        kind: "move_reaction",
        body: choice === "none" ? `${target.name} não reagiu` : `${target.name} usou ${choice === "clash" ? "Clash" : "Evade"}`,
        roll_data: response as unknown as never,
      });
      if (error) throw error;
      if (response.appliedDamage > 0) {
        try {
          await applyDamageToTarget(queryClient, gameId, target, response.appliedDamage);
        } catch (damageError) {
          toast.error(`A reação foi registrada, mas o dano não pôde ser aplicado: ${damageError instanceof Error ? damageError.message : String(damageError)}`);
        }
      }
      if (choice !== "none") {
        emitEngineActionRolled({
          gameId,
          tokenId: target.tokenId,
          characterId: target.characterId,
          characterKind: target.characterKind,
          actionType: "reaction",
          label: choice === "clash" ? "Clash" : "Evade",
          resultSuccesses: rolled.successes,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  const target = pendingReaction?.target;
  const move = pendingReaction?.move;
  const session = queryClient.getQueryData<EngineSession | null>(["game-engine-session", gameId]) ?? null;
  const participant = target ? participantForTarget(session, target) : null;
  const actionsBefore = Math.max(0, participant?.actionsUsed ?? 0);
  const required = Math.max(0, move?.accuracy.successes ?? 0) + actionsBefore;
  const clashPool = target ? Math.max(0, target.clashPool - target.painPenalty) : 0;
  const evadePool = target ? Math.max(0, target.evadePool - target.painPenalty) : 0;

  return (
    <Dialog open={!!pendingReaction} onOpenChange={() => undefined}>
      <DialogContent className="max-w-md" onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{target?.name}: como deseja reagir?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p><b>{move?.card.name}</b> obteve <b>{move?.accuracy.successes ?? 0}</b> sucesso(s).</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Dificuldade da reação: {move?.accuracy.successes ?? 0} do move + {actionsBefore} ação(ões) = <b>{required}</b>.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting || clashPool < required}
              onClick={() => void respond("clash")}
              className="h-auto flex-col gap-1 py-3"
            >
              <Swords className="h-5 w-5" />
              Clash · {clashPool}d6
              {clashPool < required && <span className="text-[10px] text-muted-foreground">Pool insuficiente</span>}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={submitting || evadePool < required}
              onClick={() => void respond("evade")}
              className="h-auto flex-col gap-1 py-3"
            >
              <Shield className="h-5 w-5" />
              Evade · {evadePool}d6
              {evadePool < required && <span className="text-[10px] text-muted-foreground">Pool insuficiente</span>}
            </Button>
          </div>
          <Button type="button" variant="secondary" className="w-full" disabled={submitting} onClick={() => void respond("none")}>
            Não fazer nada
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
