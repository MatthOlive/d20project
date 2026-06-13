import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useGameSpdefUsesInsight(gameId?: string): boolean {
  const qc = useQueryClient();
  const queryKey = ["game-spdef-uses-insight", gameId ?? null];

  const { data } = useQuery({
    queryKey,
    enabled: !!gameId,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games")
        .select("spdef_uses_insight")
        .eq("id", gameId!)
        .maybeSingle();
      if (error) throw error;
      return Boolean((data as { spdef_uses_insight?: boolean } | null)?.spdef_uses_insight);
    },
  });

  useEffect(() => {
    if (!gameId) return;
    const ch = supabase
      .channel(`game-settings-${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  return Boolean(data);
}
