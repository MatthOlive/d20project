import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearRealtimeStatus, reportRealtimeStatus } from "@/lib/client-health";

export type SharedChatMessage = {
  id: string;
  game_id: string;
  user_id: string;
  kind: string;
  body: string;
  roll_data: unknown;
  created_at: string;
};

type Listener = (message: SharedChatMessage) => void;

type SharedChatSubscription = {
  refs: number;
  queryClient: QueryClient;
  channel: ReturnType<typeof supabase.channel>;
  listeners: Set<Listener>;
  cleanupTimer: number | null;
  active: boolean;
};

const subscriptions = new Map<string, SharedChatSubscription>();

function retain(gameId: string, queryClient: QueryClient, listener: Listener) {
  const healthKey = `chat:${gameId}`;
  let entry = subscriptions.get(gameId);
  if (!entry) {
    entry = {
      refs: 0,
      queryClient,
      channel: supabase.channel(`chat-shared:${gameId}`),
      listeners: new Set(),
      cleanupTimer: null,
      active: true,
    };
    entry.channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const incoming = payload.new as SharedChatMessage;
          entry?.queryClient.setQueryData<SharedChatMessage[]>(["chat", gameId], (current) => {
            if ((current ?? []).some((message) => message.id === incoming.id)) return current ?? [];
            return [...(current ?? []), incoming].slice(-250);
          });
          for (const callback of entry?.listeners ?? []) callback(incoming);
        },
      )
      .subscribe((status) => {
        if (!entry?.active) return;
        reportRealtimeStatus(healthKey, status);
        if (status === "SUBSCRIBED") {
          void entry?.queryClient.invalidateQueries({ queryKey: ["chat", gameId] });
        }
      });
    subscriptions.set(gameId, entry);
  }

  if (entry.cleanupTimer !== null) {
    window.clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = null;
  }
  entry.refs += 1;
  entry.listeners.add(listener);

  return () => {
    const current = subscriptions.get(gameId);
    if (!current) return;
    current.refs = Math.max(0, current.refs - 1);
    current.listeners.delete(listener);
    if (current.refs > 0 || current.cleanupTimer !== null) return;
    current.cleanupTimer = window.setTimeout(() => {
      const latest = subscriptions.get(gameId);
      if (!latest || latest.refs > 0) return;
      subscriptions.delete(gameId);
      latest.active = false;
      clearRealtimeStatus(`chat:${gameId}`);
      void supabase.removeChannel(latest.channel);
    }, 1_000);
  };
}

export function useSharedChatRealtime(gameId: string, onInsert?: Listener) {
  const queryClient = useQueryClient();
  const callbackRef = useRef(onInsert);
  callbackRef.current = onInsert;

  useEffect(() => {
    const listener: Listener = (message) => callbackRef.current?.(message);
    return retain(gameId, queryClient, listener);
  }, [gameId, queryClient]);
}
