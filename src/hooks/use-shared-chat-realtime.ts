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
const CHAT_COLUMNS = "id,game_id,user_id,kind,body,roll_data,created_at";

async function syncRecentMessages(gameId: string, queryClient: QueryClient) {
  const current = queryClient.getQueryData<SharedChatMessage[]>(["chat", gameId]) ?? [];
  const newest = current[current.length - 1];
  if (!newest) return;
  const { data, error } = await supabase
    .from("chat_messages")
    .select(CHAT_COLUMNS)
    .eq("game_id", gameId)
    .gte("created_at", newest.created_at)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(200);
  if (error) return;
  queryClient.setQueryData<SharedChatMessage[]>(["chat", gameId], (existing = []) => {
    const known = new Set(existing.map((message) => message.id));
    return [
      ...existing,
      ...((data ?? []) as SharedChatMessage[]).filter((message) => !known.has(message.id)),
    ];
  });
}

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
            return [...(current ?? []), incoming];
          });
          for (const callback of entry?.listeners ?? []) callback(incoming);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string } | null)?.id;
          if (!deletedId) return;
          entry?.queryClient.setQueryData<SharedChatMessage[]>(["chat", gameId], (current = []) =>
            current.filter((message) => message.id !== deletedId),
          );
        },
      )
      .subscribe((status) => {
        if (!entry?.active) return;
        reportRealtimeStatus(healthKey, status);
        if (status === "SUBSCRIBED") {
          void syncRecentMessages(gameId, entry.queryClient);
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

