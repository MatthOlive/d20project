import { supabase } from "@/integrations/supabase/client";
import type { EngineSession } from "@/lib/game-engine/types";

export async function fetchGameEngineSession(gameId: string): Promise<EngineSession | null> {
  const { data, error } = await (supabase.rpc(
    "get_game_engine_session_compact" as never,
    { p_game_id: gameId } as never,
  ) as unknown as Promise<{
    data: EngineSession | null;
    error: { message: string } | null;
  }>);
  if (error) throw error;
  return data ? (data as EngineSession) : null;
}

export function compactParticipantImage<T extends { imageUrl: string | null }>(participant: T): T {
  return participant.imageUrl?.startsWith("data:image/")
    ? { ...participant, imageUrl: null }
    : participant;
}
