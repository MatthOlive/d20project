import { useGameRuntimeSettings } from "@/hooks/use-game-runtime-settings";

/**
 * House rule: when true (default), super-effective adds +1/+2 successes flat
 * to damage and not-very-effective subtracts 1/2 successes. When false, uses
 * the RAW rule of adding/removing dice from the damage pool before rolling.
 */
export function useGameEffectivenessFlat(gameId?: string): boolean {
  return useGameRuntimeSettings(gameId).effectivenessFlat;
}
