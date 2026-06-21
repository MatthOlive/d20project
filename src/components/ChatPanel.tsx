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
    | { dice: number[]; successes: number; ones: number; label?: string; faces?: number; modifier?: number; mode?: "sum" | "success" }
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
          window.setTimeout(() => { void askNarrator(row.kind === "roll" ? undefined : row.body); }, 800);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);