import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DigiRoleRosterEntry = {
  id: string;
  owner_id: string;
  nickname: string | null;
  image_url: string | null;
  team_slot: number | null;
  image_hidden: boolean;
  species: { name: string; stage: string; image_url: string | null } | null;
};

function table(name: string) {
  // DigiRole tables are added by the system migrations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from(name as never) as any;
}

export function useDigiRoleRoster(tamerId: string, gameId: string) {
  const queryClient = useQueryClient();
  const subscriptionId = useId().replaceAll(":", "");
  const query = useQuery({
    queryKey: ["digirole-roster", tamerId, gameId],
    queryFn: async (): Promise<DigiRoleRosterEntry[]> => {
      const result = await table("digirole_digimons")
        .select(
          "id,owner_id,nickname,image_url,image_hidden,team_slot,species:species_id(name,stage,image_url)",
        )
        .eq("tamer_id", tamerId)
        .order("team_slot", { ascending: true, nullsFirst: false });
      if (result.error) throw result.error;
      return (result.data ?? []).map(
        (
          row: DigiRoleRosterEntry & {
            species: DigiRoleRosterEntry["species"] | DigiRoleRosterEntry["species"][];
          },
        ) => ({
          ...row,
          species: Array.isArray(row.species) ? (row.species[0] ?? null) : row.species,
        }),
      );
    },
  });
  useEffect(() => {
    const channel = supabase
      .channel(`digirole-roster:${gameId}:${tamerId}:${subscriptionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "digirole_digimons",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["digirole-roster", tamerId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, queryClient, subscriptionId, tamerId]);
  return query;
}
