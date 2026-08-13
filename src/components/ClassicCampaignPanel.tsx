import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Compass, Footprints, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { countRegionBadges, gymEncounterScale, rankCapForBadgeCount } from "@/lib/classic-mode";
import { CLASSIC_SCENES, classicObjective, type ClassicSceneId } from "@/lib/classic-world";
import { RANK_LABELS, type Rank } from "@/lib/pokerole";

type ClassicProgress = {
  trainer_id: string | null;
  starter_pokemon_id: string | null;
  world_scene: ClassicSceneId;
  regional_badges: Record<string, unknown>;
  money: number;
  trainer: { id: string; name: string } | null;
  starter: {
    id: string;
    nickname: string | null;
    rank: Rank;
    species: { name: string; sprite_url: string | null } | null;
  } | null;
};

export function ClassicCampaignPanel({
  gameId,
  userId,
  onOpenTrainer,
}: {
  gameId: string;
  userId: string;
  onOpenTrainer?: (id: string, name: string) => void;
}) {
  const { data: progress, isLoading } = useQuery({
    queryKey: ["classic-progress", gameId, userId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("classic_player_progress" as never) as any)
        .select("trainer_id,starter_pokemon_id,world_scene,regional_badges,money,trainer:trainer_id(id,name),starter:starter_pokemon_id(id,nickname,rank,species:species_id(name,sprite_url))")
        .eq("game_id", gameId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ClassicProgress | null;
    },
  });

  const { data: memberCount = 1 } = useQuery({
    queryKey: ["classic-member-count", gameId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("game_members")
        .select("user_id", { count: "exact", head: true })
        .eq("game_id", gameId);
      if (error) throw error;
      return count ?? 1;
    },
  });

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Carregando jornada...</div>;

  if (!progress) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Compass className="h-10 w-10 text-primary" />
        <h2 className="mt-3 text-lg font-extrabold">Sua aventura começa no mapa</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Crie seu treinador para acordar no quarto em Pallet.
        </p>
      </div>
    );
  }

  const badgeCount = countRegionBadges(progress.regional_badges, "kanto");
  const rankCap = rankCapForBadgeCount(badgeCount);
  const scale = gymEncounterScale(memberCount, badgeCount);
  const scene = CLASSIC_SCENES[progress.world_scene] ?? CLASSIC_SCENES.bedroom;
  const objective = classicObjective(progress.starter_pokemon_id, progress.world_scene);

  return (
    <div className="h-full overflow-auto p-4">
      <div className="border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">Jornada de Kanto</h2>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md bg-muted px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-bold"><Footprints className="h-4 w-4 text-primary" />{scene.label}</span>
          <span className="text-xs text-muted-foreground">{badgeCount}/8 insígnias</span>
        </div>
      </div>

      <section className="py-4">
        <p className="text-xs font-bold uppercase text-primary">Objetivo atual</p>
        <p className="mt-2 text-sm font-semibold leading-relaxed">{objective}</p>
      </section>

      <section className="space-y-3 border-t border-border py-4">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left hover:bg-accent"
          onClick={() => progress.trainer_id && onOpenTrainer?.(progress.trainer_id, progress.trainer?.name ?? "Treinador")}
        >
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{progress.trainer?.name ?? "Treinador"}</span>
            <span className="text-xs text-muted-foreground">Limite regional: {RANK_LABELS[rankCap]}</span>
          </span>
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="rounded-md border border-border p-3">
          <p className="text-xs font-bold uppercase text-muted-foreground">Parceiro</p>
          <p className="mt-1 font-bold">
            {progress.starter?.nickname || progress.starter?.species?.name || "Ainda não escolhido"}
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-md border border-border p-3">
          <Users className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="font-bold">Grupo com {memberCount} jogador(es)</p>
            <p className="text-xs text-muted-foreground">
              Os próximos desafios poderão usar até {scale.opposingPokemon} Pokémon adversários.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
