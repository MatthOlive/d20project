import { supabase } from "@/integrations/supabase/client";
import type { PokemonSpriteStyle } from "@/lib/pokerole";
import { useGameRuntimeSettings } from "@/hooks/use-game-runtime-settings";

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
  const { spriteStyle } = useGameRuntimeSettings(gameId);
  return gameId ? spriteStyle : getLocalGameSpriteStyle(gameId);
}
