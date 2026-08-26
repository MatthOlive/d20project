import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PokemonSpriteStyle } from "@/lib/pokerole";

export type GameRuntimeSettings = {
  spriteStyle: PokemonSpriteStyle;
  spdefUsesInsight: boolean;
  effectivenessFlat: boolean;
};

export const gameRuntimeSettingsKey = (gameId?: string) =>
  ["game-runtime-settings", gameId ?? null] as const;

const DEFAULT_SETTINGS: GameRuntimeSettings = {
  spriteStyle: "pixel",
  spdefUsesInsight: false,
  effectivenessFlat: true,
};

type SharedSubscription = {
  refs: number;
  queryClient: QueryClient;
  channel: ReturnType<typeof supabase.channel>;
  cleanupTimer: number | null;
};

const sharedSubscriptions = new Map<string, SharedSubscription>();

function localSpriteStyle(gameId?: string): PokemonSpriteStyle {
  if (!gameId || typeof window === "undefined") return "pixel";
  return window.localStorage.getItem(`d20:pokemon-sprite-style:${gameId}`) === "3d"
    ? "3d"
    : "pixel";
}

function persistSpriteStyle(gameId: string, style: PokemonSpriteStyle) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(`d20:pokemon-sprite-style:${gameId}`, style);
  }
}

function normalizeSettings(value: unknown): GameRuntimeSettings {
  const row = (value ?? {}) as {
    sprite_style?: string | null;
    spdef_uses_insight?: boolean | null;
    effectiveness_flat?: boolean | null;
  };
  return {
    spriteStyle: row.sprite_style === "3d" ? "3d" : "pixel",
    spdefUsesInsight: Boolean(row.spdef_uses_insight),
    effectivenessFlat:
      row.effectiveness_flat == null ? true : Boolean(row.effectiveness_flat),
  };
}

function retainSettingsSubscription(gameId: string, queryClient: QueryClient) {
  const current = sharedSubscriptions.get(gameId);
  if (current) {
    current.refs += 1;
    if (current.cleanupTimer !== null) {
      window.clearTimeout(current.cleanupTimer);
      current.cleanupTimer = null;
    }
    return () => releaseSettingsSubscription(gameId);
  }

  const entry: SharedSubscription = {
    refs: 1,
    queryClient,
    channel: supabase.channel(`game-runtime-settings:${gameId}`),
    cleanupTimer: null,
  };
  entry.channel
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      (payload) => {
        const settings = normalizeSettings(payload.new);
        persistSpriteStyle(gameId, settings.spriteStyle);
        entry.queryClient.setQueryData(gameRuntimeSettingsKey(gameId), settings);
        entry.queryClient.setQueryData<Record<string, unknown>>(
          ["game", gameId],
          (currentGame) => currentGame
            ? { ...currentGame, ...(payload.new as Record<string, unknown>) }
            : currentGame,
        );
      },
    )
    .subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      // Close the small gap between the initial fetch and Realtime subscription,
      // and recover the complete game row after a reconnect.
      void entry.queryClient.invalidateQueries({ queryKey: gameRuntimeSettingsKey(gameId) });
      void entry.queryClient.invalidateQueries({ queryKey: ["game", gameId] });
    });
  sharedSubscriptions.set(gameId, entry);
  return () => releaseSettingsSubscription(gameId);
}

function releaseSettingsSubscription(gameId: string) {
  const entry = sharedSubscriptions.get(gameId);
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs > 0 || entry.cleanupTimer !== null) return;
  entry.cleanupTimer = window.setTimeout(() => {
    const latest = sharedSubscriptions.get(gameId);
    if (!latest || latest.refs > 0) return;
    sharedSubscriptions.delete(gameId);
    void supabase.removeChannel(latest.channel);
  }, 1_000);
}

export function useGameRuntimeSettings(gameId?: string): GameRuntimeSettings {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: gameRuntimeSettingsKey(gameId),
    enabled: !!gameId,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 60 * 60 * 1_000,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("games")
        .select("sprite_style,spdef_uses_insight,effectiveness_flat")
        .eq("id", gameId!)
        .maybeSingle();
      if (error) throw error;
      const settings = normalizeSettings(row);
      persistSpriteStyle(gameId!, settings.spriteStyle);
      return settings;
    },
  });

  useEffect(() => {
    if (!gameId) return;
    return retainSettingsSubscription(gameId, queryClient);
  }, [gameId, queryClient]);

  return data ?? { ...DEFAULT_SETTINGS, spriteStyle: localSpriteStyle(gameId) };
}
