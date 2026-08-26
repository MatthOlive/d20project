import { useGameRuntimeSettings } from "@/hooks/use-game-runtime-settings";

export function useGameSpdefUsesInsight(gameId?: string): boolean {
  return useGameRuntimeSettings(gameId).spdefUsesInsight;
}
