import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * House rule: when true (default), super-effective adds +1/+2 successes flat
 * to damage and not-very-effective subtracts 1/2 successes. When false, uses
 * the RAW rule of adding/removing dice from the damage pool before rolling.
 */
export function useGameEffectivenessFlat(gameId?: string): boolean {
  const qc = useQueryClient();
  const queryKey = ["game-effectiveness-flat", gameId ?? null];

  const { data } = useQuery({
    queryKey,
    enabled: !!gameId,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games")
        .select("effectiveness_flat")
        .eq("id", gameId!)
        .maybeSingle();
      if (error) throw error;
      const v = (data as { effectiveness_flat?: boolean } | null)?.effectiveness_flat;
      return v === undefined || v === null ? true : Boolean(v);
    },
  });

  useEffect(() => {
    if (!gameId) return;
    const ch = supabase.channel(`game-eff-${gameId}-${Math.random().toString(36).slice(2)}`);
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

  return data === undefined ? true : Boolean(data);
}
