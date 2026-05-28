import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dices, Send, Bot, Sparkles } from "lucide-react";
import { rollD6, rollDice, parseRollCommand } from "@/lib/pokerole";
import { cn } from "@/lib/utils";
import { narratorTurn } from "@/lib/narrator.functions";
import { toast } from "sonner";

type Msg = {
  id: string;
  game_id: string;
  user_id: string;
  kind: string;
  body: string;
  roll_data: { dice: number[]; successes: number; ones: number; label?: string; faces?: number } | null;
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
          window.setTimeout(() => { void askNarrator(row.kind === "roll" ? undefined : row.body); }, 800);
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

  async function quickRoll(n: number) {
    const result = rollD6(n);
    await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind: "roll",
      body: `${n}d6`,
      roll_data: { ...result, label: `${n}d6` },
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} authorName={profiles[m.user_id] ?? "…"} isMe={m.user_id === userId} />
        ))}
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {aiNarrator
              ? "Tap “Ask AI Narrator” to open the scene."
              : <>No messages yet. Try <code className="rounded bg-muted px-1.5 py-0.5">/roll 5</code> to roll 5d6.</>}
          </p>
        )}
        {aiBusy && (
          <p className="text-center text-xs italic text-muted-foreground"><Bot className="inline h-3 w-3" /> Narrator is thinking…</p>
        )}
      </div>
      <div className="border-t border-border p-3">
        {aiNarrator && (
          <div className="mb-2 flex flex-wrap gap-1">
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs"
              disabled={aiBusy}
              onClick={() => askNarrator(messages.length === 0 ? "Begin the adventure. Set the opening scene." : undefined)}
            >
              <Sparkles className="mr-1 h-3 w-3" />
              {messages.length === 0 ? "Start adventure" : "Ask AI Narrator"}
            </Button>
          </div>
        )}
        <div className="mb-2 flex flex-wrap gap-1">
          {[2, 3, 4, 5, 6, 7].map((n) => (
            <Button key={n} variant="outline" size="sm" className="h-7 text-xs" onClick={() => quickRoll(n)}>
              <Dices className="mr-1 h-3 w-3" /> {n}d6
            </Button>
          ))}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); void send(); }}
          className="flex gap-2"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message or /roll N"
          />
          <Button type="submit" size="icon"><Send className="h-4 w-4" /></Button>
        </form>
      </div>
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
  if (msg.kind === "roll" && msg.roll_data) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="font-semibold text-foreground">{authorName}</span>
          <span className="text-muted-foreground">rolled {msg.body}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {msg.roll_data.dice.map((d, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md border text-sm font-bold tabular-nums",
                d >= 4
                  ? "border-success bg-success text-success-foreground"
                  : d === 1
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-border bg-muted text-foreground",
              )}
            >{d}</span>
          ))}
          <span className="ml-2 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-bold text-success">
            {msg.roll_data.successes} success{msg.roll_data.successes === 1 ? "" : "es"}
          </span>
          {msg.roll_data.ones > 0 && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
              {msg.roll_data.ones} × 1
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
