import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PokemonSpriteStyle } from "@/lib/pokerole";

export const DEFAULT_POKEMON_SPRITE_STYLE: PokemonSpriteStyle = "pixel";

function keyFor(gameId: string) {
  return `d20:pokemon-sprite-style:${gameId}`;
}

function normalizeSpriteStyle(value: unknown): PokemonSpriteStyle {
  return value === "3d" ? "3d" : "pixel";
}

export function getLocalGameSpriteStyle(gameId?: string): PokemonSpriteStyle {
  if (!gameId || typeof window === "undefined") return DEFAULT_POKEMON_SPRITE_STYLE;
  return normalizeSpriteStyle(window.localStorage.getItem(keyFor(gameId)));
}

export async function saveGameSpriteStyle(gameId: string, style: PokemonSpriteStyle) {
  if (typeof window !== "undefined") window.localStorage.setItem(keyFor(gameId), style);
  const { error } = await supabase
    .from("games")
    .update({ sprite_style: style } as never)
    .eq("id", gameId);
  if (!error) return { persistedInDatabase: true };

  const message = error.message ?? "";
  const missingColumn = message.includes("sprite_style") || message.includes("schema cache");
  if (missingColumn) return { persistedInDatabase: false, message };
  throw error;
}

export function useGameSpriteStyle(gameId?: string): PokemonSpriteStyle {
  const qc = useQueryClient();
  const queryKey = ["game-sprite-style", gameId ?? null];

  const { data } = useQuery({
    queryKey,
    enabled: !!gameId,
    staleTime: 0,
    queryFn: async () => {
      const local = getLocalGameSpriteStyle(gameId);
      const { data, error } = await supabase
        .from("games")
        .select("sprite_style")
        .eq("id", gameId!)
        .maybeSingle();
      if (error) {
        const message = error.message ?? "";
        if (message.includes("sprite_style") || message.includes("schema cache")) return local;
        throw error;
      }
      const remote = normalizeSpriteStyle((data as { sprite_style?: string | null } | null)?.sprite_style);
      if (typeof window !== "undefined") window.localStorage.setItem(keyFor(gameId!), remote);
      return remote;
    },
  });

  useEffect(() => {
    if (!gameId) return;
    const ch = supabase.channel(`game-sprite-style-${gameId}-${Math.random().toString(36).slice(2)}`);
    ch.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      () => qc.invalidateQueries({ queryKey }),
    ).subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  return data ?? getLocalGameSpriteStyle(gameId);
}
