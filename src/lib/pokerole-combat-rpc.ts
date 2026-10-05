import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

type RpcError = {
  code?: string;
  message: string;
};

type CombatRpcResult<T> = {
  data: T | null;
  error: RpcError | null;
};

export type AtomicCombatMessage = {
  id: string;
  game_id: string;
  user_id: string;
  kind: string;
  body: string;
  roll_data: Json;
  created_at: string;
};

export function isAtomicCombatRpcUnavailable(error: RpcError | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /function .* does not exist|schema cache/i.test(error.message)
  );
}

export async function submitAtomicMoveReaction(
  gameId: string,
  sourceMessageId: string,
  response: Record<string, unknown>,
): Promise<CombatRpcResult<AtomicCombatMessage>> {
  return supabase.rpc("submit_pokerole_move_reaction", {
    p_game_id: gameId,
    p_source_message_id: sourceMessageId,
    p_response: response,
  });
}

export async function finalizeAtomicMove(
  gameId: string,
  sourceMessageId: string,
): Promise<CombatRpcResult<AtomicCombatMessage>> {
  return supabase.rpc("finalize_pokerole_move", {
    p_game_id: gameId,
    p_source_message_id: sourceMessageId,
  });
}
