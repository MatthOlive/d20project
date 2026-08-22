import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

function rpc<T>(name: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  return supabase.rpc(name as never, args as never) as unknown as Promise<RpcResult<T>>;
}

export function useGameEngine({ gameId, actor }: { gameId: string; actor: EngineActor }) {
  const queryClient = useQueryClient();
  const sessionKey = ["game-engine-session", gameId] as const;
  const channelInstanceRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );

  const sessionQuery = useQuery({
    queryKey: sessionKey,
    queryFn: async () => {
      const query = supabase.from("game_engine_sessions" as never) as never as {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => {
            maybeSingle: () => Promise<RpcResult<EngineSession>>;
          };
        };
      };
      const { data, error } = await query.select("*").eq("game_id", gameId).maybeSingle();
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  const eventsQuery = useQuery({
    queryKey: ["game-engine-events", sessionQuery.data?.id],
    queryFn: async () => {
      if (!sessionQuery.data?.id) return [];
      const query = supabase.from("game_engine_events" as never) as never as {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => {
            order: (
              column: string,
              options: { ascending: boolean },
            ) => {
              limit: (count: number) => Promise<RpcResult<EngineEvent[]>>;
            };
          };
        };
      };
      const { data, error } = await query
        .select("id,session_id,game_id,version,actor_user_id,command,payload,created_at")
        .eq("session_id", sessionQuery.data.id)
        .order("version", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!sessionQuery.data?.id,
    retry: false,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`game-engine:${gameId}:${channelInstanceRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_engine_sessions",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["game-engine-session", gameId],
          });
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
        () => {
          void queryClient.invalidateQueries({ queryKey: ["game-engine-events"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, queryClient]);

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
      void queryClient.invalidateQueries({ queryKey: ["game-engine-events"] });
    },
  });

  const commandMutation = useMutation({
    mutationFn: async (command: EngineCommand) => {
      const latest =
        queryClient.getQueryData<EngineSession | null>(sessionKey) ?? sessionQuery.data;
      if (!latest) throw new Error("Nenhum encontro ativo foi encontrado.");
      const nextState = applyEngineCommand(latest.state, command, actor);
      const { data, error } = await rpc<EngineSession>("commit_game_engine_state", {
        p_session_id: latest.id,
        p_expected_version: latest.version,
        p_command: command.type,
        p_payload: engineCommandPayload(command),
        p_next_state: nextState,
      });
      if (error) throw error;
      if (!data) throw new Error("O banco não retornou o novo estado do encontro.");
      return data;
    },
    onSuccess: (session) => {
      queryClient.setQueryData(sessionKey, session);
      void queryClient.invalidateQueries({ queryKey: ["game-engine-events"] });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKey });
    },
  });

  return {
    session: sessionQuery.data ?? null,
    events: eventsQuery.data ?? [],
    isLoading: sessionQuery.isLoading,
    error: sessionQuery.error,
    start: startMutation.mutateAsync,
    commit: commandMutation.mutateAsync,
    isBusy: startMutation.isPending || commandMutation.isPending,
    refresh: () => queryClient.invalidateQueries({ queryKey: sessionKey }),
  };
}
