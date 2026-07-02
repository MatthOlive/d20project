import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reads the live character image + status conditions for a token. Subscribes
 * are wired centrally in MapBoard's realtime channel, which invalidates
 * `token-pokemon`/`token-trainer` queries on any change to the source row.
 */
function useCharacter(kind: "trainer" | "pokemon" | "t20", id: string) {
  return useQuery({
    queryKey: [kind === "trainer" ? "token-trainer-status" : kind === "pokemon" ? "token-pokemon-status" : "token-t20-status", id],
    queryFn: async () => {
      if (kind === "t20") {
        const { data, error } = await (supabase.from("t20_characters" as never) as any)
          .select("image_url")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        return {
          image_url: (data as { image_url?: string | null } | null)?.image_url ?? null,
          status: [] as string[],
        };
      }
      if (kind === "trainer") {
        const { data, error } = await supabase
          .from("trainers")
          .select("image_url,status_conditions")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        return {
          image_url: (data as { image_url?: string | null } | null)?.image_url ?? null,
          status: ((data as { status_conditions?: string[] } | null)?.status_conditions ?? []) as string[],
        };
      }
      const { data, error } = await supabase
        .from("pokemon")
        .select("image_url,status,species:species_id(sprite_url)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      const row = data as {
        image_url?: string | null;
        status?: string[] | null;
        species?: { sprite_url?: string | null } | null;
      } | null;
      return {
        image_url: row?.image_url ?? row?.species?.sprite_url ?? null,
        status: (row?.status ?? []) as string[],
      };
    },
    staleTime: 0,
  });
}

const STATUS_ICONS: Record<string, { emoji: string; color: string; title: string }> = {
  Burn:           { emoji: "🔥", color: "#f97316", title: "Burn" },
  Poison:         { emoji: "☠️", color: "#a855f7", title: "Poison" },
  Paralyzed:      { emoji: "⚡", color: "#eab308", title: "Paralyzed" },
  "Frozen Solid": { emoji: "❄️", color: "#38bdf8", title: "Frozen Solid" },
  Sleep:          { emoji: "💤", color: "#94a3b8", title: "Sleep" },
  Confused:       { emoji: "💫", color: "#f59e0b", title: "Confused" },
  Disabled:       { emoji: "🚫", color: "#ef4444", title: "Disabled" },
  Flinched:       { emoji: "😵", color: "#64748b", title: "Flinched" },
  "In Love":      { emoji: "💗", color: "#ec4899", title: "In Love" },
};

export function TokenAvatar({
  kind, id, fallbackImage, label, variant = "token",
}: {
  kind: "trainer" | "pokemon" | "t20";
  id: string;
  fallbackImage: string | null;
  label: string;
  variant?: "token" | "handout";
}) {
  const { data } = useCharacter(kind, id);
  const img = data?.image_url ?? fallbackImage;
  return img ? (
    <img src={img} alt={label} className={`h-full w-full object-cover ${variant === "handout" ? "rounded-none" : "rounded-full"}`} draggable={false} />
  ) : (
    <span className="text-xs font-bold">{label.slice(0, 2).toUpperCase()}</span>
  );
}

export function TokenStatusBadges({
  kind, id,
}: {
  kind: "trainer" | "pokemon" | "t20";
  id: string;
}) {
  const { data } = useCharacter(kind, id);
  const list = data?.status ?? [];
  if (list.length === 0) return null;
  return (
    <div className="pointer-events-none absolute -right-2 -top-2 flex flex-wrap items-center justify-end gap-0.5">
      {list.map((s) => {
        const icon = STATUS_ICONS[s] ?? { emoji: "❗", color: "#ef4444", title: s };
        return (
          <span
            key={s}
            title={icon.title}
            className="flex h-4 w-4 items-center justify-center rounded-full border border-background text-[10px] leading-none shadow"
            style={{ backgroundColor: icon.color }}
          >
            <span style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,0.5))" }}>{icon.emoji}</span>
          </span>
        );
      })}
    </div>
  );
}
