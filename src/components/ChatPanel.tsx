import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dices, Send, Bot, Sparkles } from "lucide-react";
import { rollDice, parseRollCommand } from "@/lib/pokerole";
import { drawReactionCard } from "@/lib/contest";
import { cn } from "@/lib/utils";
import { narratorTurn } from "@/lib/narrator.functions";
import { toast } from "sonner";
import { MoveCard, SuccessHover, type MoveRollMessage } from "@/components/MoveCard";
import { FloatingWindow } from "@/components/FloatingWindow";

type Msg = {
  id: string;
  game_id: string;
  user_id: string;
  kind: string;
  body: string;
  roll_data:
    | {
        dice: number[];
        successes: number;
        ones: number;
        label?: string;
        faces?: number;
        modifier?: number;
        mode?: "sum" | "success";
      }
    | MoveRollMessage
    | null;
  created_at: string;
};

export function ChatPanel({
  gameId,
  userId,
  aiNarrator = false,
  isGameOwner = false,
}: {
  gameId: string;
  userId: string;
  aiNarrator?: boolean;
  isGameOwner?: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "narrator">("chat");
  const [showDiceWindow, setShowDiceWindow] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const runNarratorTurn = useServerFn(narratorTurn);

  const { data: messages = [] } = useQuery<Msg[]>({
    queryKey: ["chat_messages", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["game_profiles", gameId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, username");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: game } = useQuery({
    queryKey: ["game_title", gameId],
    queryFn: async () => {
      const { data, error } = await supabase.from("games").select("title").eq("id", gameId).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `game_id=eq.${gameId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["chat_messages", gameId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    const currentText = text;
    setText("");

    if (currentText.startsWith("/")) {
      const parsed = parseRollCommand(currentText);
      if (parsed) {
        const result = rollDice(parsed.count, parsed.faces, parsed.modifier, parsed.mode);
        const body = `rolled ${parsed.count}d${parsed.faces}${parsed.modifier ? (parsed.modifier > 0 ? `+${parsed.modifier}` : parsed.modifier) : ""}${parsed.label ? ` for ${parsed.label}` : ""}`;

        await supabase.from("chat_messages").insert({
          game_id: gameId,
          user_id: userId,
          kind: "roll",
          body,
          roll_data: {
            dice: result.dice,
            successes: result.successes,
            ones: result.ones,
            label: parsed.label,
            faces: parsed.faces,
            modifier: parsed.modifier,
            mode: parsed.mode,
          },
        });
        return;
      }
    }

    await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind: "text",
      body: currentText,
    });
  }

  async function handleQuickRoll(count: number, faces: number) {
    const result = rollDice(count, faces, 0, faces === 6 ? "success" : "sum");
    await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind: "roll",
      body: `rolled ${count}d${faces}`,
      roll_data: {
        dice: result.dice,
        successes: result.successes,
        ones: result.ones,
        faces,
        mode: faces === 6 ? "success" : "sum",
      },
    });
  }

  async function handleNarratorSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    const currentText = text;
    setText("");

    await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind: "text",
      body: currentText,
    });

    try {
      const chatHistory = messages.map((m) => ({
        role: m.user_id === "narrator" ? ("assistant" as const) : ("user" as const),
        content: m.body,
      }));

      const response = await runNarratorTurn({
        gameTitle: game?.title ?? "Pokémon RPG",
        chatHistory,
        newMessage: currentText,
      });

      if (response) {
        await supabase.from("chat_messages").insert({
          game_id: gameId,
          user_id: "narrator",
          kind: "narrator",
          body: response,
        });
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to get response from AI Narrator");
    }
  }

  async function handleDrawContestCard() {
    // Puxa uma carta padrão (Normal / Beauty) diretamente como era feito originalmente
    const card = drawReactionCard("Normal", "Beauty");
    const body = `drew a Contest Reaction Card for Beauty (Normal Rank):\n\n**${card.title}**\n\n*Effect:* ${card.effect}\n\n*Points:* ${card.points}`;

    await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind: "contest",
      body,
    });
  }

  function renderRollData(rd: any) {
    if (!rd || !rd.dice) return null;
    const isD6 = rd.faces === 6;
    const mode = rd.mode ?? (isD6 ? "success" : "sum");
    const sum = rd.dice.reduce((a: number, b: number) => a + b, 0);
    const mod = rd.modifier ?? 0;
    const total = sum + mod;

    return (
      <div className="mt-1.5 rounded-md border border-border bg-muted/50 p-1.5 font-mono text-[11px]">
        {rd.label && <div className="mb-1 font-sans font-semibold text-muted-foreground">{rd.label}:</div>}
        <div className="flex flex-wrap items-center gap-1">
          {rd.dice.map((d: number, i: number) => (
            <span
              key={i}
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold shadow-sm",
                isD6 && mode === "success" && d >= 4
                  ? "border-success bg-success text-success-foreground"
                  : isD6 && mode === "success" && d === 1
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-border bg-muted text-foreground",
              )}
            >
              {d}
            </span>
          ))}
          {mode === "success" ? (
            <>
              <span className="ml-2 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-bold text-success">
                {rd.successes} success{rd.successes === 1 ? "" : "es"}
              </span>
              {rd.ones > 0 && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  {rd.ones} × 1
                </span>
              )}
            </>
          ) : (
            <span className="ml-2 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
              total {total}
              {mod !== 0 ? ` (${sum}${mod > 0 ? ` +${mod}` : ` ${mod}`})` : ""}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background/95 shadow-xl relative overflow-visible">
      {/* Barra de Abas Superior para o Narrador (Se ativo) */}
      {aiNarrator && (
        <div className="flex items-center justify-start border-b px-4 py-2 bg-card z-10 shrink-0">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={activeTab === "chat" ? "default" : "ghost"}
              onClick={() => setActiveTab("chat")}
              className="h-8 text-xs"
            >
              Chat
            </Button>
            <Button
              size="sm"
              variant={activeTab === "narrator" ? "default" : "ghost"}
              onClick={() => setActiveTab("narrator")}
              className="h-8 text-xs gap-1"
            >
              <Bot className="h-3 w-3" /> Narrator
            </Button>
          </div>
        </div>
      )}

      {/* Lista de Mensagens */}
      <div className="flex-1 overflow-y-auto overflow-x-visible p-4 space-y-3 min-h-0 z-0">
        {messages
          .filter((m) => (activeTab === "chat" ? m.kind !== "narrator" : m.kind === "narrator" || m.user_id === userId))
          .map((msg) => {
            const isMe = msg.user_id === userId;
            const isNarrator = msg.user_id === "narrator";
            const profile = profiles.find((p) => p.id === msg.user_id);
            const authorName = isNarrator ? "AI Narrator" : profile?.username || "Unknown";

            if (msg.kind === "move" && msg.roll_data && "v" in msg.roll_data) {
              const rd = msg.roll_data as MoveRollMessage;
              const hasTargets = rd.damage?.targets && rd.damage.targets.length > 0;

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex flex-col max-w-[320px] relative overflow-visible",
                    isMe ? "ml-auto items-end" : "mr-auto items-start",
                  )}
                >
                  <span className="px-1 text-[11px] text-muted-foreground mb-0.5">
                    {rd.pokemonName} ({authorName})
                  </span>
                  <MoveCard
                    data={rd.card}
                    hasStab={rd.hasStab}
                    className="w-full text-left overflow-visible"
                    accuracySlot={
                      <SuccessHover
                        label="Sucessos"
                        successes={rd.accuracy.successes}
                        dice={rd.accuracy.dice}
                        critInfo={
                          rd.accuracy.crit
                            ? { required: rd.accuracy.crit.required, critRequired: rd.accuracy.crit.critRequired }
                            : undefined
                        }
                      />
                    }
                    damageSlot={
                      hasTargets ? null : rd.damage ? (
                        <SuccessHover
                          label="Dano"
                          successes={rd.damage.successes}
                          dice={rd.damage.dice}
                          tone="danger"
                        />
                      ) : undefined
                    }
                    chanceSlot={
                      rd.chance && rd.chance.length > 0
                        ? rd.chance.map((c, i) => (
                            <div key={i} className="mt-1 block">
                              <span className="text-[10px] text-muted-foreground font-semibold block mb-0.5">
                                {c.label}:
                              </span>
                              <SuccessHover
                                label="Efeito"
                                successes={c.successes}
                                dice={c.dice}
                                highlight={(d) => d === 6}
                                tone="amber"
                                emptyText="No effect dice"
                              />
                            </div>
                          ))
                        : undefined
                    }
                    footer={
                      rd.damage?.targets && rd.damage.targets.length > 0 ? (
                        <div className="mt-2 space-y-1.5 border-t pt-1.5 overflow-visible">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Resultados por Alvo:
                          </span>
                          {rd.damage.targets.map((tgt, idx) => {
                            const effLower = (tgt.effLabel || "").toLowerCase();

                            const isNotVeryEffectiveOrLess =
                              effLower.includes("not very") ||
                              effLower.includes("no effect") ||
                              effLower.includes("immune") ||
                              tgt.immune;

                            let displayDamage = tgt.finalDamage;
                            if (displayDamage === 0 && !isNotVeryEffectiveOrLess) {
                              displayDamage = 1;
                            }

                            return (
                              <div
                                key={idx}
                                className="flex flex-col gap-1 rounded bg-muted/30 p-1.5 border border-border/40 text-[11px] overflow-visible"
                              >
                                <div className="flex justify-between items-center font-medium">
                                  <span className="truncate">{tgt.name}</span>
                                  <span className="text-[10px] rounded bg-background px-1 border border-border/60 text-muted-foreground font-mono lowercase">
                                    {tgt.defStat} {tgt.def} · {tgt.effLabel}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between mt-0.5 overflow-visible">
                                  <span className="text-muted-foreground text-[10px]">Rolagem de Dano:</span>
                                  {tgt.dice && tgt.dice.length > 0 ? (
                                    <SuccessHover
                                      label="Dano"
                                      successes={displayDamage}
                                      dice={tgt.dice}
                                      tone="danger"
                                    />
                                  ) : (
                                    <span className="font-bold text-destructive">{displayDamage} DMG</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : rd.accuracy.crit?.isCrit ? (
                        <div className="text-[10px] font-bold text-amber-500 bg-amber-500/10 p-1 rounded text-center border border-amber-500/20 animate-pulse">
                          💥 ACERTO CRÍTICO! (+1 Dado de Dano adicionado)
                        </div>
                      ) : undefined
                    }
                  />
                </div>
              );
            }

            return (
              <div key={msg.id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                <span className="px-1 text-xs text-muted-foreground">{authorName}</span>
                <div
                  className={cn(
                    "max-w-[280px] rounded-lg px-3 py-1.5 text-sm shadow-sm whitespace-pre-wrap break-words",
                    isNarrator
                      ? "bg-purple-600/10 text-purple-200 border border-purple-500/20 font-serif italic"
                      : isMe
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                  )}
                >
                  {msg.body}
                  {msg.kind === "roll" && renderRollData(msg.roll_data)}
                </div>
              </div>
            );
          })}
        <div ref={bottomRef} />
      </div>

      {/* Janela Flutuante de Dados (FloatingWindow) controlada pelo botão Dados */}
      {showDiceWindow && (
        <FloatingWindow onClose={() => setShowDiceWindow(false)}>
          <div className="p-2 space-y-2 text-center bg-popover rounded-md border border-border shadow-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Quick Roll:
            </span>
            <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-[240px]">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    handleQuickRoll(n, 6);
                    setShowDiceWindow(false);
                  }}
                  className="h-6 px-2 text-[10px] font-mono font-bold"
                >
                  {n}d6
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  handleQuickRoll(1, 20);
                  setShowDiceWindow(false);
                }}
                className="h-6 px-2 text-[10px] font-mono font-bold"
              >
                1d20
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  handleQuickRoll(1, 100);
                  setShowDiceWindow(false);
                }}
                className="h-6 px-2 text-[10px] font-mono font-bold"
              >
                1d100
              </Button>
            </div>
          </div>
        </FloatingWindow>
      )}

      {/* Rodapé Original do Chat */}
      <div className="border-t p-3 space-y-2 bg-card/50 shrink-0">
        <div className="flex items-center gap-1.5">
          {/* Botão Dados: Abre/fecha a janela flutuante dos dados */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowDiceWindow(!showDiceWindow)}
            className="h-7 text-xs gap-1 px-2.5 font-medium border-border"
          >
            <Dices className="h-3.5 w-3.5 text-muted-foreground" /> Dados
          </Button>

          {/* Botão Contest: Puxa a carta imediatamente no chat */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleDrawContestCard}
            className="h-7 text-xs gap-1 px-2.5 font-medium border-border"
          >
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" /> Contest
          </Button>
        </div>

        <form onSubmit={activeTab === "narrator" ? handleNarratorSubmit : handleSend} className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              activeTab === "narrator"
                ? "Talk to the AI Narrator..."
                : "Type message or /roll count d[faces] [label]..."
            }
            className="h-9 text-xs focus-visible:ring-1"
          />
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
