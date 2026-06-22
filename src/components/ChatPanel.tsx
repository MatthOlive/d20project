import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dices, Send, Bot, Sparkles, Award } from "lucide-react";
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

const DICE_FACES = [2, 4, 6, 8, 10, 12, 20, 100] as const;

export function ChatPanel({
  gameId,
  userId,
  aiNarrator = false,
  isGameOwner = false,
}: {
  gameId: string;
  userId: string;
  aiNarrator?: boolean;
  /** Only the game's owner triggers the AI to avoid duplicate replies. */
  isGameOwner?: boolean;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const aiBusyRef = useRef(false);
  const lastTriggeredIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const callNarrator = useServerFn(narratorTurn);

  const { data: messages = [] } = useQuery({
    queryKey: ["chat", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  const { data: profiles = {} } = useQuery({
    queryKey: ["profiles-for-chat", gameId, messages.length],
    queryFn: async () => {
      const ids = Array.from(new Set(messages.map((m) => m.user_id)));
      if (ids.length === 0) return {};
      const { data } = await supabase.from("profiles").select("id,display_name").in("id", ids);
      const map: Record<string, string> = {};
      (data ?? []).forEach((p) => (map[p.id] = p.display_name));
      return map;
    },
    enabled: messages.length > 0,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `game_id=eq.${gameId}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["chat", gameId] });
          // Auto-trigger AI narrator on any player chat/roll message.
          const row = payload.new as { id: string; kind: string; user_id: string; body: string };
          if (!aiNarrator || !isGameOwner) return;
          if (row.kind === "narrator") return;
          if (row.id === lastTriggeredIdRef.current) return;
          if (aiBusyRef.current) return;
          lastTriggeredIdRef.current = row.id;
          // Small debounce so a chat + roll combo is consumed as one beat.
          window.setTimeout(() => {
            void askNarrator(row.kind === "roll" ? undefined : row.body);
          }, 800);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, qc, aiNarrator, isGameOwner]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    const roll = parseRollCommand(trimmed);
    if (roll) {
      const result = rollDice(roll.n, roll.faces);
      const body = roll.label ?? `${roll.n}d${roll.faces}`;
      await supabase.from("chat_messages").insert({
        game_id: gameId,
        user_id: userId,
        kind: "roll",
        body,
        roll_data: { ...result, label: body },
      });
    } else {
      await supabase.from("chat_messages").insert({
        game_id: gameId,
        user_id: userId,
        kind: "chat",
        body: trimmed,
      });
    }
  }

  async function askNarrator(prompt?: string) {
    if (aiBusyRef.current) return;
    aiBusyRef.current = true;
    setAiBusy(true);
    try {
      await callNarrator({ data: { gameId, userPrompt: prompt } });
      qc.invalidateQueries({ queryKey: ["chat", gameId] });
      qc.invalidateQueries({ queryKey: ["initiative", gameId] });
      qc.invalidateQueries({ queryKey: ["characters", gameId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Narrator failed");
    } finally {
      aiBusyRef.current = false;
      setAiBusy(false);
    }
  }

  async function rollFromPanel(faces: number, count: number, modifier: number, successMode: boolean) {
    const n = Math.max(1, Math.min(50, Math.floor(count)));
    const mod = Math.floor(modifier) || 0;
    const result = rollDice(n, faces);
    const mode: "sum" | "success" = faces === 6 && successMode ? "success" : "sum";
    const modStr = mod === 0 ? "" : mod > 0 ? ` +${mod}` : ` ${mod}`;
    const body = `${n}d${faces}${modStr}`;
    await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind: "roll",
      body,
      roll_data: { ...result, label: body, modifier: mod, mode },
    });
  }

  async function drawContest() {
    // Fetch game-level weight overrides (narrator can set in Settings)
    const { data: g } = await supabase
      .from("games")
      .select("contest_weights")
      .eq("id", gameId)
      .single<{ contest_weights: Record<string, number> | null }>();
    const card = drawReactionCard(g?.contest_weights ?? null);
    await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind: "contest",
      body: card.name,
      roll_data: {
        v: "contest-1",
        cardId: card.id,
        name: card.name,
        hearts: card.hearts,
        description: card.description,
      },
    });
  }

  const [diceOpen, setDiceOpen] = useState(false);
  const [successMode, setSuccessMode] = useState(false);
  const [diceRows, setDiceRows] = useState<Record<number, { count: number; mod: number }>>(
    () =>
      Object.fromEntries(DICE_FACES.map((f) => [f, { count: 1, mod: 0 }])) as Record<
        number,
        { count: number; mod: number }
      >,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} authorName={profiles[m.user_id] ?? "…"} isMe={m.user_id === userId} />
        ))}
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {aiNarrator ? (
              "Tap “Ask AI Narrator” to open the scene."
            ) : (
              <>
                No messages yet. Try <code className="rounded bg-muted px-1.5 py-0.5">/r 5d6</code> or{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">/r 2d20</code>.
              </>
            )}
          </p>
        )}
        {aiBusy && (
          <p className="text-center text-xs italic text-muted-foreground">
            <Bot className="inline h-3 w-3" /> Narrator is thinking…
          </p>
        )}
      </div>
      <div className="shrink-0 border-t border-border bg-card p-3">
        {aiNarrator && (
          <div className="mb-2 flex flex-wrap gap-1">
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs"
              disabled={aiBusy}
              onClick={() =>
                askNarrator(messages.length === 0 ? "Begin the adventure. Set the opening scene." : undefined)
              }
            >
              <Sparkles className="mr-1 h-3 w-3" />
              {messages.length === 0 ? "Start adventure" : "Ask AI Narrator"}
            </Button>
          </div>
        )}
        <div className="mb-2 flex flex-wrap gap-1">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDiceOpen(true)}>
            <Dices className="mr-1 h-3 w-3" /> Dados
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void drawContest()}
            title="Sortear carta de reação de Contest"
          >
            <Award className="mr-1 h-3 w-3" /> Contest
          </Button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex gap-2"
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message or /r 3d6" />
          <Button type="submit" size="icon" aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
      {diceOpen && (
        <FloatingWindow
          title="Dados"
          onClose={() => setDiceOpen(false)}
          width={360}
          height={480}
          initialX={typeof window !== "undefined" ? Math.max(20, window.innerWidth - 400) : 100}
          initialY={120}
        >
          <div className="space-y-3 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={successMode}
                onChange={(e) => setSuccessMode(e.target.checked)}
                className="h-4 w-4 rounded-full accent-primary"
              />
              <span className="font-medium">Sucesso</span>
              <span className="text-xs text-muted-foreground">(d6: 4-6 = sucesso)</span>
            </label>
            <div className="space-y-2">
              {DICE_FACES.map((faces) => {
                const row = diceRows[faces];
                return (
                  <div key={faces} className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={row.count}
                      onChange={(e) =>
                        setDiceRows((prev) => ({
                          ...prev,
                          [faces]: { ...prev[faces], count: parseInt(e.target.value || "1", 10) },
                        }))
                      }
                      className="h-8 w-16"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-16 text-xs font-bold"
                      onClick={() => void rollFromPanel(faces, row.count, row.mod, successMode)}
                    >
                      d{faces}
                    </Button>
                    <span className="text-xs text-muted-foreground">+</span>
                    <Input
                      type="number"
                      value={row.mod}
                      onChange={(e) =>
                        setDiceRows((prev) => ({
                          ...prev,
                          [faces]: { ...prev[faces], mod: parseInt(e.target.value || "0", 10) },
                        }))
                      }
                      className="h-8 w-16"
                      placeholder="0"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </FloatingWindow>
      )}
    </div>
  );
}

function MessageBubble({ msg, authorName, isMe }: { msg: Msg; authorName: string; isMe: boolean }) {
  if (msg.kind === "narrator") {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary">
          <Bot className="h-3 w-3" /> Narrator
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.body}</p>
      </div>
    );
  }
  if (msg.kind === "contest" && msg.roll_data) {
    const c = msg.roll_data as unknown as { name: string; hearts: number; description: string };
    const tone =
      c.hearts > 0
        ? "border-success/40 bg-success/10 text-success"
        : c.hearts < 0
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted/40 text-foreground";
    return (
      <div className={`rounded-lg border p-3 ${tone}`}>
        <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide">
          <span className="opacity-80">{authorName} drew</span>
          <span className="rounded bg-background/40 px-1.5 py-0.5">Contest · Reaction</span>
          <span className="ml-auto tabular-nums">{c.hearts > 0 ? `+${c.hearts}` : c.hearts} ♥</span>
        </div>
        <p className="text-sm font-bold">{c.name}</p>
        <p className="mt-0.5 text-xs opacity-90">{c.description}</p>
      </div>
    );
  }
  if (msg.kind === "move" && msg.roll_data && (msg.roll_data as MoveRollMessage).v === "move-1") {
    const m = msg.roll_data as MoveRollMessage;
    const crit = m.accuracy.crit;
    return (
      <div className="space-y-1">
        <div className="px-1 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{authorName}</span> · {m.pokemonName} used{" "}
          <b>{m.card.name}</b>
          {crit?.isCrit && (
            <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-600">
              CRÍTICO +1 dado
            </span>
          )}
        </div>
        <MoveCard
          data={m.card}
          hasStab={m.hasStab}
          accuracySlot={
            <span className="inline-flex items-center gap-1">
              <SuccessHover label="success" successes={m.accuracy.successes} dice={m.accuracy.dice} />
              {crit && (
                <span className="text-[10px] text-muted-foreground">
                  need {crit.required} (crit {crit.critRequired})
                </span>
              )}
            </span>
          }
          damageSlot={
            m.damage ? (
              <span className="inline-flex items-center gap-1">
                <SuccessHover label="dmg" successes={m.damage.successes} dice={m.damage.dice} tone="danger" />
                {m.damage.critBonus ? (
                  <span className="text-[10px] font-bold text-amber-600">+{m.damage.critBonus} dado crit</span>
                ) : null}
              </span>
            ) : (
              <span className="text-muted-foreground">Status</span>
            )
          }
          damageDetailsSlot={
            m.damage?.targets && m.damage.targets.length > 0 ? (
              <div className="rounded-md border border-border bg-muted/30 p-2">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Dano por alvo
                </div>
                <ul className="space-y-0.5">
                  {m.damage.targets.map((t, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{t.name}</span>
                      <span className="flex items-center gap-1 tabular-nums">
                        <span className="rounded bg-muted px-1 text-[10px]">
                          {t.defStat === "spdef" ? "SpDef" : "Def"} {t.def}
                        </span>
                        <span className="rounded bg-muted/60 px-1 text-[10px]">{t.effLabel}</span>
                        {t.immune ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                            Imune (0)
                          </span>
                        ) : (
                          <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-bold text-destructive">
                            {t.finalDamage} dmg
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          }
          chanceSlot={
            m.chance && m.chance.length > 0 ? (
              <>
                {m.chance.map((c, i) => (
                  <SuccessHover
                    key={i}
                    label={`6s · ${c.label}`}
                    successes={c.successes}
                    dice={c.dice}
                    tone="amber"
                    highlight={(d) => d === 6}
                  />
                ))}
              </>
            ) : null
          }
        />
      </div>
    );
  }

  // Legacy simple roll message
  const rd = msg.roll_data as unknown as {
    dice: number[];
    successes: number;
    ones: number;
    faces?: number;
    modifier?: number;
    mode?: "sum" | "success";
  } | null;
  if (msg.kind === "roll" && rd) {
    const faces = rd.faces ?? 6;
    const isD6 = faces === 6;
    const mod = rd.modifier ?? 0;
    const mode = rd.mode ?? (isD6 ? "success" : "sum");
    const sum = rd.dice.reduce((a, b) => a + b, 0);
    const total = sum + mod;

    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="font-semibold text-foreground">{authorName}</span>
          <span className="text-muted-foreground">rolled {msg.body}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {rd.dice.map((d, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 text-sm font-bold tabular-nums",
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
    <div className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
      <span className="px-1 text-xs text-muted-foreground">{authorName}</span>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-1.5 text-sm",
          isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {msg.body}
      </div>
    </div>
  );
}
