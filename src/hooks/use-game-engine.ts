import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyEngineCommand, engineCommandPayload } from "@/lib/game-engine/core";
import type {
  EngineActor,
  EngineCommand,
  EngineEvent,
  EngineSession,
  EngineState,
} from "@/lib/game-engine/types";

type RpcResult<T> = { data: T | null; error: { message: string; code?: string } | null };

const SESSION_COLUMNS =
  "id,game_id,page_id,system_id,status,version,state,created_by,created_at,updated_at";
const EVENT_COLUMNS =
  "id,session_id,game_id,version,actor_user_id,command,payload,created_at";

function rpc<T>(name: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  return supabase.rpc(name as never, args as never) as unknown as Promise<RpcResult<T>>;
}

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? error);
  }
  return String(error);
}

function codeOf(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code ?? "");
  }
  return "";
}

function isRetryableEngineError(error: unknown) {
  const message = messageOf(error);
  const code = codeOf(error);
  return (
    code === "40001" ||
    code === "429" ||
    /state changed|failed to fetch|network|timeout|timed out|connection|502|503|504/i.test(message)
  );
}

function commandId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function fetchSession(gameId: string): Promise<EngineSession | null> {
  const query = supabase.from("game_engine_sessions" as never) as never as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<RpcResult<EngineSession>>;
      };
    };
  };
  const { data, error } = await query.select(SESSION_COLUMNS).eq("game_id", gameId).maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchEvents(sessionId: string): Promise<EngineEvent[]> {
  const query = supabase.from("game_engine_events" as never) as never as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options: { ascending: boolean }) => {
          limit: (count: number) => Promise<RpcResult<EngineEvent[]>>;
        };
      };
    };
  };
  const { data, error } = await query
    .select(EVENT_COLUMNS)
    .eq("session_id", sessionId)
    .order("version", { ascending: false })
    .limit(40);
  if (error) throw error;
  return data ?? [];
}

async function commandWasCommitted(sessionId: string, id: string) {
  const query = supabase.from("game_engine_events" as never) as never as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        contains: (column: string, value: Record<string, unknown>) => {
          limit: (count: number) => Promise<RpcResult<Array<{ id: number }>>>;
        };
      };
    };
  };
  const { data, error } = await query
    .select("id")
    .eq("session_id", sessionId)
    .contains("payload", { commandId: id })
    .limit(1);
  return !error && (data?.length ?? 0) > 0;
}

type SharedEngineSubscription = {
  refs: number;
  queryClient: QueryClient;
  channel: ReturnType<typeof supabase.channel>;
  cleanupTimer: number | null;
};

const sharedEngineSubscriptions = new Map<string, SharedEngineSubscription>();

function retainEngineSubscription(gameId: string, queryClient: QueryClient) {
  const current = sharedEngineSubscriptions.get(gameId);
  if (current) {
    current.refs += 1;
    if (current.cleanupTimer !== null) {
      window.clearTimeout(current.cleanupTimer);
      current.cleanupTimer = null;
    }
    return () => releaseEngineSubscription(gameId);
  }

  const sessionKey = ["game-engine-session", gameId] as const;
  const entry: SharedEngineSubscription = {
    refs: 1,
    queryClient,
    channel: supabase.channel(`game-engine:${gameId}`),
    cleanupTimer: null,
  };
  entry.channel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_engine_sessions",
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        if (payload.eventType === "DELETE") {
          entry.queryClient.setQueryData(sessionKey, null);
          return;
        }
        const incoming = payload.new as unknown as EngineSession;
        if (!incoming?.id) return;
        entry.queryClient.setQueryData(sessionKey, incoming);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "game_engine_events",
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        const incoming = payload.new as unknown as EngineEvent;
        if (!incoming?.session_id) return;
        entry.queryClient.setQueryData<EngineEvent[]>(
          ["game-engine-events", incoming.session_id],
          (currentEvents) => {
            const withoutDuplicate = (currentEvents ?? []).filter(
              (event) => event.id !== incoming.id,
            );
            return [incoming, ...withoutDuplicate]
              .sort((left, right) => right.version - left.version)
              .slice(0, 40);
          },
        );
      },
    )
    .subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      // A single refetch on subscribe closes the fetch/subscription race and
      // also restores state after the WebSocket reconnects.
      void entry.queryClient.invalidateQueries({ queryKey: sessionKey });
      void entry.queryClient.invalidateQueries({ queryKey: ["game-engine-events"] });
    });
  sharedEngineSubscriptions.set(gameId, entry);
  return () => releaseEngineSubscription(gameId);
}

function releaseEngineSubscription(gameId: string) {
  const entry = sharedEngineSubscriptions.get(gameId);
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs > 0 || entry.cleanupTimer !== null) return;
  entry.cleanupTimer = window.setTimeout(() => {
    const latest = sharedEngineSubscriptions.get(gameId);
    if (!latest || latest.refs > 0) return;
    sharedEngineSubscriptions.delete(gameId);
    void supabase.removeChannel(latest.channel);
  }, 1_000);
}

export function useGameEngine({ gameId, actor }: { gameId: string; actor: EngineActor }) {
  const queryClient = useQueryClient();
  const sessionKey = ["game-engine-session", gameId] as const;

  const sessionQuery = useQuery({
    queryKey: sessionKey,
    queryFn: () => fetchSession(gameId),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 2,
  });

  const eventsQuery = useQuery({
    queryKey: ["game-engine-events", sessionQuery.data?.id],
    queryFn: () => (sessionQuery.data?.id ? fetchEvents(sessionQuery.data.id) : Promise.resolve([])),
    enabled: !!sessionQuery.data?.id,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 2,
  });

  useEffect(
    () => retainEngineSubscription(gameId, queryClient),
    [gameId, queryClient],
  );

  const startMutation = useMutation({
    mutationFn: async (state: EngineState) => {
      const { data, error } = await rpc<EngineSession>("start_game_engine_session", {
        p_game_id: gameId,
        p_page_id: state.pageId,
        p_system_id: state.systemId,
        p_state: state,
      });
      if (error) throw error;
      if (!data) throw new Error("O banco não retornou a sessão criada.");
      return data;
    },
    onSuccess: (session) => {
      queryClient.setQueryData(sessionKey, session);
      void queryClient.invalidateQueries({
        queryKey: ["game-engine-events", session.id],
      });
    },
  });

  const commandMutation = useMutation({
    mutationFn: async (command: EngineCommand) => {
      const id = commandId();
      let latest =
        queryClient.getQueryData<EngineSession | null>(sessionKey) ?? sessionQuery.data;
      if (!latest) throw new Error("Nenhum encontro ativo foi encontrado.");

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const nextState = applyEngineCommand(latest.state, command, actor);
        const payload = { ...engineCommandPayload(command), commandId: id };
        const { data, error } = await rpc<EngineSession>("commit_game_engine_state", {
          p_session_id: latest.id,
          p_expected_version: latest.version,
          p_command: command.type,
          p_payload: payload,
          p_next_state: nextState,
        });
        if (!error && data) return data;

        const failure = error ?? new Error("O banco não retornou o novo estado do encontro.");
        if (!isRetryableEngineError(failure) || attempt === 3) throw failure;

        const refreshed = await fetchSession(gameId);
        if (!refreshed) throw new Error("O encontro deixou de existir durante a sincronização.");
        queryClient.setQueryData(sessionKey, refreshed);
        if (await commandWasCommitted(refreshed.id, id)) return refreshed;
        latest = refreshed;
        await new Promise((resolve) => window.setTimeout(resolve, 80 * 2 ** attempt));
      }
      throw new Error("Não foi possível sincronizar a ação com o motor.");
    },
    onSuccess: (session) => {
      queryClient.setQueryData(sessionKey, session);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKey });
    },
  });

  async function refreshSession() {
    const session = await fetchSession(gameId);
    queryClient.setQueryData(sessionKey, session);
    if (session) {
      const events = await fetchEvents(session.id);
      queryClient.setQueryData(["game-engine-events", session.id], events);
    }
    return session;
  }

  return {
    session: sessionQuery.data ?? null,
    events: eventsQuery.data ?? [],
    isLoading: sessionQuery.isLoading,
    error: sessionQuery.error,
    start: startMutation.mutateAsync,
    commit: commandMutation.mutateAsync,
    isBusy: startMutation.isPending || commandMutation.isPending,
    refresh: refreshSession,
  };
}
