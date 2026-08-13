import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Compass,
  Footprints,
  LoaderCircle,
  MapPin,
  Monitor,
  PackageOpen,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabase-paged";
import { rollPokemonAutofill } from "@/lib/pokemon-autofill";
import { RANK_LABELS, type Rank } from "@/lib/pokerole";
import {
  CLASSIC_ENCOUNTER_CHANCE,
  CLASSIC_ROUTE_ENCOUNTERS,
  CLASSIC_SCENES,
  classicObjective,
  classicTileKey,
  findClassicPath,
  findNpcTrainerChallenge,
  isClassicTileWalkable,
  type ClassicFacing,
  type ClassicNpcTrainer,
  type ClassicSceneId,
  type ClassicTileKind,
} from "@/lib/classic-world";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PokemonSpriteImage } from "@/components/PokemonSpriteImage";
import { ClassicBattleWindow, type ClassicBattleEncounter } from "@/components/ClassicBattleWindow";
import "./ClassicWorld.css";

type TrainerSummary = {
  id: string;
  name: string;
  image_url: string | null;
};

type ClassicWorldPlayer = {
  game_id: string;
  user_id: string;
  trainer_id: string | null;
  starter_pokemon_id: string | null;
  current_city: string;
  story_step: string;
  story_flags: Record<string, unknown>;
  world_scene: ClassicSceneId;
  tile_x: number;
  tile_y: number;
  facing: ClassicFacing;
  updated_at: string;
  trainer: TrainerSummary | null;
};

type StarterSpecies = {
  id: string;
  dex_number: number | null;
  name: string;
  sprite_url: string | null;
  suggested_rank: Rank | null;
  is_legendary: boolean | null;
};

type WildSpecies = Pick<StarterSpecies, "id" | "name" | "sprite_url" | "suggested_rank">;

type WildEncounter = ClassicBattleEncounter & {
  id: string;
  species_id: string;
  rank: Rank;
  tile_x: number;
  tile_y: number;
  species: WildSpecies | null;
};

type Position = {
  scene: ClassicSceneId;
  x: number;
  y: number;
  facing: ClassicFacing;
};

const CLASSIC_ENCOUNTER_SELECT = "id,species_id,rank,tile_x,tile_y,status,wild_pokemon_id,player_pokemon_id,battle_phase,active_side,player_initiative,opponent_initiative,player_actions,opponent_actions,round_no,metadata,species:species_id(id,name,sprite_url,suggested_rank)";

function supabaseErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return String(error);

  const value = error as Record<string, unknown>;
  const message = typeof value.message === "string" ? value.message : "Erro desconhecido do banco";
  const detail = typeof value.details === "string" && value.details.trim() ? value.details : null;
  const hint = typeof value.hint === "string" && value.hint.trim() ? value.hint : null;
  const code = typeof value.code === "string" && value.code.trim() ? value.code : null;
  return [message, detail, hint, code ? `código ${code}` : null].filter(Boolean).join(" · ");
}

const TILE_SIZE_DESKTOP = 44;
const TILE_SIZE_MOBILE = 36;

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(element.tagName);
}

function movementFromKey(key: string): { dx: number; dy: number; facing: ClassicFacing } | null {
  switch (key.toLowerCase()) {
    case "arrowup":
    case "w":
      return { dx: 0, dy: -1, facing: "up" };
    case "arrowdown":
    case "s":
      return { dx: 0, dy: 1, facing: "down" };
    case "arrowleft":
    case "a":
      return { dx: -1, dy: 0, facing: "left" };
    case "arrowright":
    case "d":
      return { dx: 1, dy: 0, facing: "right" };
    default:
      return null;
  }
}

export function ClassicWorld({
  gameId,
  userId,
  toolbarSlot,
  onOpenTrainer,
  onOpenPokemon,
  onOpenTurnOrder,
}: {
  gameId: string;
  userId: string;
  toolbarSlot?: ReactNode;
  onOpenTrainer?: (id: string, name: string) => void;
  onOpenPokemon?: (id: string, name: string) => void;
  onOpenTurnOrder?: () => void;
}) {
  const qc = useQueryClient();
  const boardRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<HTMLButtonElement>(null);
  const positionRef = useRef<Position | null>(null);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingPersistsRef = useRef(0);
  const lastMoveAtRef = useRef(0);
  const encounterRollRef = useRef(false);
  const autoWalkRunRef = useRef(0);
  const autoWalkStopRef = useRef(false);
  const routeSpeciesRef = useRef<WildSpecies[]>([]);
  const grassStepsRef = useRef<Partial<Record<ClassicSceneId, number>>>({});
  const [trainerName, setTrainerName] = useState("");
  const [tokenSelected, setTokenSelected] = useState(true);
  const [starterPickerOpen, setStarterPickerOpen] = useState(false);
  const [pcStorageOpen, setPcStorageOpen] = useState(false);
  const [starterSearch, setStarterSearch] = useState("");
  const [selectedSpeciesId, setSelectedSpeciesId] = useState("");
  const [localEncounter, setLocalEncounter] = useState<WildEncounter | null>(null);
  const [isAutoWalking, setIsAutoWalking] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  const playersQueryKey = useMemo(() => ["classic-world-players", gameId] as const, [gameId]);
  const { data: players = [], isLoading } = useQuery({
    queryKey: playersQueryKey,
    queryFn: async () => {
      const { data, error } = await (supabase.from("classic_player_progress" as never) as any)
        .select("game_id,user_id,trainer_id,starter_pokemon_id,current_city,story_step,story_flags,world_scene,tile_x,tile_y,facing,updated_at,trainer:trainer_id(id,name,image_url)")
        .eq("game_id", gameId);
      if (error) throw error;
      return (data ?? []) as ClassicWorldPlayer[];
    },
  });

  const ownProgress = players.find((player) => player.user_id === userId) ?? null;
  const ownScene = ownProgress ? CLASSIC_SCENES[ownProgress.world_scene] : CLASSIC_SCENES.bedroom;

  useEffect(() => {
    const updateCompact = () => setIsCompact(window.innerWidth < 720);
    updateCompact();
    window.addEventListener("resize", updateCompact);
    return () => window.removeEventListener("resize", updateCompact);
  }, []);

  useEffect(() => {
    if (!ownProgress || pendingPersistsRef.current > 0) return;
    positionRef.current = {
      scene: ownProgress.world_scene,
      x: ownProgress.tile_x,
      y: ownProgress.tile_y,
      facing: ownProgress.facing,
    };
  }, [ownProgress]);

  useEffect(() => {
    const channel = supabase
      .channel(`classic-world:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "classic_player_progress", filter: `game_id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: playersQueryKey }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [gameId, playersQueryKey, qc]);

  const { data: pendingEncounter } = useQuery({
    queryKey: ["classic-pending-encounter", gameId, userId],
    enabled: !!ownProgress,
    queryFn: async () => {
      const { data, error } = await (supabase.from("classic_encounters" as never) as any)
        .select("id,species_id,rank,tile_x,tile_y,status,wild_pokemon_id,player_pokemon_id,battle_phase,active_side,player_initiative,opponent_initiative,player_actions,opponent_actions,round_no,metadata,species:species_id(id,name,sprite_url,suggested_rank)")
        .eq("game_id", gameId)
        .eq("user_id", userId)
        .in("status", ["pending", "in_battle", "won", "lost"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WildEncounter | null;
    },
  });

  const activeEncounter = localEncounter ?? pendingEncounter ?? null;

  const { data: routeSpecies = [] } = useQuery({
    queryKey: ["classic-route-species"],
    enabled: !!ownProgress?.starter_pokemon_id,
    queryFn: async () => {
      const { data, error } = await (supabase.from("species") as any)
        .select("id,name,sprite_url,suggested_rank")
        .in("name", [...new Set(Object.values(CLASSIC_ROUTE_ENCOUNTERS).flatMap((names) => names ?? []))]);
      if (error) throw error;
      return (data ?? []) as WildSpecies[];
    },
  });

  useEffect(() => {
    routeSpeciesRef.current = routeSpecies;
  }, [routeSpecies]);

  const { data: starterSpecies = [], isLoading: startersLoading } = useQuery({
    queryKey: ["classic-starters", "kanto"],
    enabled: !!ownProgress && !ownProgress.starter_pokemon_id,
    queryFn: async () => {
      const species = await fetchAllPaged<StarterSpecies>(
        "species",
        "id,dex_number,name,sprite_url,suggested_rank,is_legendary",
        { orderBy: "dex_number", ascending: true },
      );
      return species.filter((entry) => {
        const rank = entry.suggested_rank ?? "starter";
        const isBaseForm = !/\b(mega|g-max|gigantamax|primal)\b/i.test(entry.name);
        const isNativeKantoForm = !/\b(alolan|galarian|hisuian|paldean)\b/i.test(entry.name);
        return (entry.dex_number ?? 9999) <= 151
          && !entry.is_legendary
          && isBaseForm
          && isNativeKantoForm
          && (rank === "starter" || rank === "beginner");
      });
    },
  });

  const filteredStarters = useMemo(() => {
    const term = starterSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) return starterSpecies;
    return starterSpecies.filter((entry) => entry.name.toLocaleLowerCase("pt-BR").includes(term));
  }, [starterSearch, starterSpecies]);

  const createTrainer = useMutation({
    mutationFn: async () => {
      const cleanName = trainerName.trim();
      if (!cleanName) throw new Error("Digite o nome do treinador.");
      let trainerId: string | null = null;
      try {
        const { data: trainer, error: trainerError } = await supabase
          .from("trainers")
          .insert({ game_id: gameId, owner_id: userId, name: cleanName })
          .select("id,name")
          .single();
        if (trainerError) throw trainerError;
        trainerId = trainer.id;

        const { error: progressError } = await (supabase.from("classic_player_progress" as never) as any).insert({
          game_id: gameId,
          user_id: userId,
          trainer_id: trainer.id,
          starter_pokemon_id: null,
          home_region: "kanto",
          current_region: "kanto",
          home_city: "pallet",
          current_city: "pallet",
          regional_badges: { kanto: [] },
          story_step: "leave_bedroom",
          world_scene: "bedroom",
          tile_x: CLASSIC_SCENES.bedroom.spawn.x,
          tile_y: CLASSIC_SCENES.bedroom.spawn.y,
          facing: "down",
        });
        if (progressError) throw progressError;
        return trainer;
      } catch (error) {
        if (trainerId) await supabase.from("trainers").delete().eq("id", trainerId);
        throw error;
      }
    },
    onSuccess: () => {
      setTokenSelected(true);
      qc.invalidateQueries({ queryKey: playersQueryKey });
      qc.invalidateQueries({ queryKey: ["classic-progress", gameId, userId] });
      qc.invalidateQueries({ queryKey: ["characters", gameId] });
      toast.success("Treinador criado. Sua jornada começa no quarto!");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createStarter = useMutation({
    mutationFn: async () => {
      if (!ownProgress?.trainer_id) throw new Error("Treinador não encontrado.");
      const species = starterSpecies.find((entry) => entry.id === selectedSpeciesId);
      if (!species) throw new Error("Escolha seu Pokémon inicial.");
      let pokemonId: string | null = null;
      try {
        const rank = species.suggested_rank === "beginner" ? "beginner" : "starter";
        const { patch, moveIds } = await rollPokemonAutofill(species.id, rank);
        const { data: pokemon, error: pokemonError } = await (supabase.from("pokemon") as any)
          .insert({
            game_id: gameId,
            owner_id: userId,
            owner_trainer_id: ownProgress.trainer_id,
            team_slot: 1,
            species_id: species.id,
            rank,
            ...patch,
          })
          .select("id")
          .single();
        if (pokemonError) throw pokemonError;
        pokemonId = pokemon.id;

        if (moveIds.length > 0) {
          const { error: movesError } = await (supabase.from("pokemon_moves") as any).insert(
            moveIds.map((moveId) => ({ pokemon_id: pokemon.id, move_id: moveId })),
          );
          if (movesError) throw movesError;
        }

        const { error: progressError } = await (supabase.from("classic_player_progress" as never) as any)
          .update({ starter_pokemon_id: pokemon.id, story_step: "leave_pallet" })
          .eq("game_id", gameId)
          .eq("user_id", userId);
        if (progressError) throw progressError;
        return { pokemonId: pokemon.id, name: species.name };
      } catch (error) {
        if (pokemonId) await supabase.from("pokemon").delete().eq("id", pokemonId);
        throw error;
      }
    },
    onSuccess: ({ name }) => {
      setStarterPickerOpen(false);
      setSelectedSpeciesId("");
      qc.invalidateQueries({ queryKey: playersQueryKey });
      qc.invalidateQueries({ queryKey: ["classic-progress", gameId, userId] });
      qc.invalidateQueries({ queryKey: ["characters", gameId] });
      toast.success(`${name} agora é seu parceiro!`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const withdrawBedroomPotion = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("claim_classic_bedroom_potion", {
        p_game_id: gameId,
      });
      if (error) throw error;
      return data as { claimed?: boolean } | null;
    },
    onSuccess: () => {
      const nextFlags = { ...(ownProgress?.story_flags ?? {}), bedroom_potion_taken: true };
      qc.setQueryData<ClassicWorldPlayer[]>(playersQueryKey, (current) => (current ?? []).map((player) => (
        player.user_id === userId ? { ...player, story_flags: nextFlags } : player
      )));
      setPcStorageOpen(false);
      void qc.invalidateQueries({ queryKey: ["characters", gameId] });
      toast.success("Potion guardada na mochila do treinador.");
      requestAnimationFrame(() => boardRef.current?.focus());
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const healParty = useMutation({
    mutationFn: async (source: "mother" | "center") => {
      const { data, error } = await (supabase.rpc as any)("classic_heal_party_at_home", {
        p_game_id: gameId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (healedCount, source) => {
      void qc.invalidateQueries({ queryKey: ["characters", gameId] });
      void qc.invalidateQueries({ queryKey: ["pokemon", gameId] });
      const healer = source === "center" ? "O Centro Pokémon" : "Sua mãe";
      toast.success(healedCount > 0
        ? `${healer} recuperou a vida e removeu as condições de ${healedCount} Pokémon da equipe.`
        : "Sua equipe já está descansada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resolveEncounter = useMutation({
    mutationFn: async () => {
      if (!activeEncounter) return;
      const { error } = await (supabase.from("classic_encounters" as never) as any)
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", activeEncounter.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setLocalEncounter(null);
      autoWalkStopRef.current = false;
      qc.invalidateQueries({ queryKey: ["classic-pending-encounter", gameId, userId] });
      requestAnimationFrame(() => boardRef.current?.focus());
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patchPlayerCache = useCallback((position: Position, extra?: Partial<ClassicWorldPlayer>) => {
    qc.setQueryData<ClassicWorldPlayer[]>(playersQueryKey, (current) => (current ?? []).map((player) => (
      player.user_id === userId
        ? {
          ...player,
          world_scene: position.scene,
          tile_x: position.x,
          tile_y: position.y,
          facing: position.facing,
          ...extra,
        }
        : player
    )));
  }, [playersQueryKey, qc, userId]);

  const persistPosition = useCallback((position: Position, extra?: Record<string, unknown>) => {
    pendingPersistsRef.current += 1;
    persistQueueRef.current = persistQueueRef.current
      .then(async () => {
        const { error } = await (supabase.from("classic_player_progress" as never) as any)
          .update({
            world_scene: position.scene,
            tile_x: position.x,
            tile_y: position.y,
            facing: position.facing,
            current_city: position.scene,
            ...extra,
          })
          .eq("game_id", gameId)
          .eq("user_id", userId);
        if (error) throw error;
      })
      .catch((error: Error) => {
        toast.error(`Não foi possível salvar o movimento: ${error.message}`);
        void qc.invalidateQueries({ queryKey: playersQueryKey });
      })
      .finally(() => {
        pendingPersistsRef.current = Math.max(0, pendingPersistsRef.current - 1);
      });
  }, [gameId, playersQueryKey, qc, userId]);

  const startWildEncounter = useCallback(async (position: Position) => {
    const encounterNames: readonly string[] = CLASSIC_ROUTE_ENCOUNTERS[position.scene] ?? [];
    if (encounterRollRef.current || activeEncounter || encounterNames.length === 0) return;

    const grassSteps = (grassStepsRef.current[position.scene] ?? 0) + 1;
    grassStepsRef.current[position.scene] = grassSteps;
    if (grassSteps < 6 && Math.random() >= CLASSIC_ENCOUNTER_CHANCE) return;

    encounterRollRef.current = true;
    autoWalkStopRef.current = true;
    let encounterStage = "carregando a espécie";
    try {
      let availableSpecies = routeSpeciesRef.current.filter((entry) => encounterNames.includes(entry.name));
      if (availableSpecies.length === 0) {
        const { data, error } = await (supabase.from("species") as any)
          .select("id,name,sprite_url,suggested_rank")
          .in("name", [...encounterNames]);
        if (error) throw error;
        availableSpecies = (data ?? []) as WildSpecies[];
        routeSpeciesRef.current = [
          ...routeSpeciesRef.current.filter((entry) => !availableSpecies.some((loaded) => loaded.id === entry.id)),
          ...availableSpecies,
        ];
      }
      if (availableSpecies.length === 0) {
        throw new Error(`Nenhuma espécie da ${CLASSIC_SCENES[position.scene].label} foi encontrada no catálogo.`);
      }

      const species = availableSpecies[Math.floor(Math.random() * availableSpecies.length)];
      const rank: Rank = Math.random() < 0.72 ? "starter" : "beginner";
      encounterStage = `preenchendo ${species.name}`;
      const { patch, moveIds } = await rollPokemonAutofill(species.id, rank);
      encounterStage = `criando ${species.name}`;
      const { data: encounterId, error: createError } = await (supabase.rpc as any)(
        "create_classic_battle_encounter",
        {
          p_game_id: gameId,
          p_scene: position.scene,
          p_tile_x: position.x,
          p_tile_y: position.y,
          p_team: [{
            species_id: species.id,
            nickname: species.name,
            rank,
            move_ids: moveIds,
            ...patch,
          }],
          p_metadata: { source: "tall_grass", prototype: true },
        },
      );
      if (createError) throw createError;

      encounterStage = "carregando a batalha";
      const { data, error } = await (supabase.from("classic_encounters" as never) as any)
        .select(CLASSIC_ENCOUNTER_SELECT)
        .eq("id", encounterId)
        .single();
      if (error) throw error;
      grassStepsRef.current[position.scene] = 0;
      setLocalEncounter(data as WildEncounter);
    } catch (error) {
      const message = supabaseErrorMessage(error);
      if (!/duplicate key|one_pending/i.test(message)) toast.error(`Encontro falhou ao ${encounterStage}: ${message}`);
      void qc.invalidateQueries({ queryKey: ["classic-pending-encounter", gameId, userId] });
    } finally {
      encounterRollRef.current = false;
    }
  }, [activeEncounter, gameId, qc, userId]);

  const startTrainerEncounter = useCallback(async (npc: ClassicNpcTrainer, position: Position) => {
    if (encounterRollRef.current || activeEncounter) return;
    encounterRollRef.current = true;
    autoWalkStopRef.current = true;
    let encounterStage = "carregando a equipe do treinador";
    try {
      const requestedNames = npc.team.map((member) => member.species);
      const { data: speciesRows, error: speciesError } = await (supabase.from("species") as any)
        .select("id,name,sprite_url,suggested_rank")
        .in("name", requestedNames);
      if (speciesError) throw speciesError;
      if ((speciesRows ?? []).length !== new Set(requestedNames).size) {
        const foundNames = new Set((speciesRows ?? []).map((entry: WildSpecies) => entry.name));
        const missing = [...new Set(requestedNames)].filter((name) => !foundNames.has(name));
        throw new Error(`Catálogo incompleto para o desafio: ${missing.join(", ")}.`);
      }

      const opponentTeam: Array<Record<string, unknown>> = [];
      for (const member of npc.team) {
        const species = (speciesRows ?? []).find((entry: WildSpecies) => entry.name === member.species) as WildSpecies | undefined;
        if (!species) throw new Error(`Espécie ${member.species} não encontrada.`);
        encounterStage = `preenchendo ${species.name}`;
        const { patch, moveIds } = await rollPokemonAutofill(species.id, member.rank);
        encounterStage = `criando ${species.name}`;
        opponentTeam.push({
            species_id: species.id,
            nickname: species.name,
            rank: member.rank,
            move_ids: moveIds,
            ...patch,
        });
      }

      encounterStage = "abrindo a batalha de treinador";
      const { data: encounterId, error: createError } = await (supabase.rpc as any)(
        "create_classic_battle_encounter",
        {
          p_game_id: gameId,
          p_scene: position.scene,
          p_tile_x: position.x,
          p_tile_y: position.y,
          p_team: opponentTeam,
          p_metadata: {
            source: "npc_trainer",
            opponent_kind: "trainer",
            opponent_name: npc.name,
            opponent_trainer_rank: npc.rank,
            opponent_defeated_ids: [],
            npc_defeated_flag: npc.defeatedFlag,
          },
        },
      );
      if (createError) throw createError;

      encounterStage = "carregando a batalha de treinador";
      const { data: encounter, error: encounterError } = await (supabase.from("classic_encounters" as never) as any)
        .select(CLASSIC_ENCOUNTER_SELECT)
        .eq("id", encounterId)
        .single();
      if (encounterError) throw encounterError;
      toast(`${npc.name}: Ei! Vamos batalhar!`);
      setLocalEncounter(encounter as WildEncounter);
    } catch (error) {
      autoWalkStopRef.current = false;
      toast.error(`Desafio com ${npc.name} falhou ao ${encounterStage}: ${supabaseErrorMessage(error)}`);
    } finally {
      encounterRollRef.current = false;
    }
  }, [activeEncounter, gameId, userId]);

  const move = useCallback((dx: number, dy: number, facing: ClassicFacing) => {
    if (!ownProgress || activeEncounter || createStarter.isPending) return;
    const current = positionRef.current ?? {
      scene: ownProgress.world_scene,
      x: ownProgress.tile_x,
      y: ownProgress.tile_y,
      facing: ownProgress.facing,
    };
    const scene = CLASSIC_SCENES[current.scene];
    const targetX = current.x + dx;
    const targetY = current.y + dy;
    const targetKey = classicTileKey(targetX, targetY);

    if (scene.routeEndZones?.has(targetKey)) {
      toast("Esta parte da região ainda não está aberta.");
      const turned = { ...current, facing };
      positionRef.current = turned;
      patchPlayerCache(turned);
      persistPosition(turned);
      return;
    }

    const transition = scene.transitions[targetKey];
    if (transition) {
      if (transition.requiresStarter && !ownProgress.starter_pokemon_id) {
        toast.error("Você precisa buscar seu Pokémon no laboratório antes de partir.");
        return;
      }
      const next: Position = { scene: transition.scene, x: transition.x, y: transition.y, facing };
      const storyStep = transition.scene === "lab" && !ownProgress.starter_pokemon_id
        ? "choose_starter"
        : transition.scene === "route_1"
          ? "route_1"
          : ownProgress.story_step;
      positionRef.current = next;
      patchPlayerCache(next, { story_step: storyStep });
      persistPosition(next, { story_step: storyStep });
      return;
    }

    const interaction = scene.interactions?.[targetKey];
    if (interaction) {
      if (interaction.kind === "message") {
        toast(interaction.message);
      } else if (interaction.kind === "pc-storage") {
        setPcStorageOpen(true);
      } else if (interaction.kind === "pokemon-center-heal") {
        if (!healParty.isPending) healParty.mutate("center");
      } else if (!ownProgress.starter_pokemon_id) {
        toast("Sua mãe deseja boa sorte. Volte depois de escolher seu primeiro Pokémon.");
      } else if (!healParty.isPending) {
        healParty.mutate("mother");
      }
      const turned = { ...current, facing };
      positionRef.current = turned;
      patchPlayerCache(turned);
      persistPosition(turned);
      return;
    }

    if (scene.tiles[targetY]?.[targetX] === "ledge") {
      const landingY = targetY + 1;
      if (dy !== 1 || dx !== 0 || !isClassicTileWalkable(scene, targetX, landingY)) {
        const turned = { ...current, facing };
        positionRef.current = turned;
        patchPlayerCache(turned);
        persistPosition(turned);
        return;
      }
      const landing: Position = { scene: current.scene, x: targetX, y: landingY, facing };
      positionRef.current = landing;
      patchPlayerCache(landing);
      persistPosition(landing);
      if (scene.tiles[landingY][targetX] === "tall-grass") void startWildEncounter(landing);
      return;
    }

    if (!isClassicTileWalkable(scene, targetX, targetY)) {
      const turned = { ...current, facing };
      positionRef.current = turned;
      patchPlayerCache(turned);
      persistPosition(turned);
      return;
    }

    const next: Position = { scene: current.scene, x: targetX, y: targetY, facing };
    positionRef.current = next;
    patchPlayerCache(next);
    persistPosition(next);

    if (scene.starterZones?.has(targetKey) && !ownProgress.starter_pokemon_id) {
      autoWalkStopRef.current = true;
      setStarterPickerOpen(true);
      return;
    }
    const challenger = findNpcTrainerChallenge(scene, targetX, targetY, ownProgress.story_flags ?? {});
    if (challenger) {
      void startTrainerEncounter(challenger, next);
      return;
    }
    if (scene.tiles[targetY][targetX] === "tall-grass") void startWildEncounter(next);
  }, [activeEncounter, createStarter.isPending, healParty, ownProgress, patchPlayerCache, persistPosition, startTrainerEncounter, startWildEncounter]);

  const walkToTile = useCallback(async (targetX: number, targetY: number) => {
    if (!ownProgress || activeEncounter || createStarter.isPending) return;
    const current = positionRef.current ?? {
      scene: ownProgress.world_scene,
      x: ownProgress.tile_x,
      y: ownProgress.tile_y,
      facing: ownProgress.facing,
    };
    const scene = CLASSIC_SCENES[current.scene];
    const path = findClassicPath(scene, current, { x: targetX, y: targetY });
    if (!path) {
      toast("Não há um caminho livre até esse local.");
      return;
    }
    if (path.length === 0) return;

    const runId = autoWalkRunRef.current + 1;
    autoWalkRunRef.current = runId;
    autoWalkStopRef.current = false;
    setTokenSelected(true);
    setIsAutoWalking(true);

    try {
      for (const step of path) {
        if (autoWalkRunRef.current !== runId || autoWalkStopRef.current) break;
        move(step.dx, step.dy, step.facing);
        if (autoWalkStopRef.current) break;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 145));
      }
    } finally {
      if (autoWalkRunRef.current === runId) setIsAutoWalking(false);
      boardRef.current?.focus();
    }
  }, [activeEncounter, createStarter.isPending, move, ownProgress]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const direction = movementFromKey(event.key);
      if (!direction || !tokenSelected) return;
      event.preventDefault();
      autoWalkRunRef.current += 1;
      autoWalkStopRef.current = false;
      setIsAutoWalking(false);
      const now = Date.now();
      if (event.repeat && now - lastMoveAtRef.current < 105) return;
      lastMoveAtRef.current = now;
      move(direction.dx, direction.dy, direction.facing);
    }
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move, tokenSelected]);

  useEffect(() => {
    if (!ownProgress) return;
    const frame = requestAnimationFrame(() => {
      const board = boardRef.current;
      const token = tokenRef.current;
      if (!board || !token) return;
      const left = token.offsetLeft + token.offsetWidth / 2 - board.clientWidth / 2;
      const top = token.offsetTop + token.offsetHeight / 2 - board.clientHeight / 2;
      board.scrollTo({ left, top, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [ownProgress?.tile_x, ownProgress?.tile_y, ownProgress?.world_scene]);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center bg-[#09110e] text-sm font-semibold text-white/70">Carregando mundo...</div>;
  }

  if (!ownProgress) {
    return (
      <div className="relative flex h-full min-h-[420px] items-center justify-center overflow-hidden bg-[#0b1711] p-4">
        <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(#25452f_1px,transparent_1px),linear-gradient(90deg,#25452f_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative w-full max-w-md rounded-md border border-white/15 bg-[#101712]/95 p-6 shadow-2xl">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <UserRound className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-primary">Kanto · Pallet</p>
              <h2 className="text-xl font-extrabold text-white">Crie seu treinador</h2>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="classic-world-trainer-name" className="text-white/80">Nome</Label>
            <Input
              id="classic-world-trainer-name"
              value={trainerName}
              onChange={(event) => setTrainerName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && trainerName.trim() && !createTrainer.isPending) createTrainer.mutate();
              }}
              placeholder="Nome do personagem"
              maxLength={60}
              autoFocus
            />
          </div>
          <Button
            className="mt-5 w-full"
            disabled={!trainerName.trim() || createTrainer.isPending}
            onClick={() => createTrainer.mutate()}
          >
            {createTrainer.isPending ? "Preparando o quarto..." : "Começar aventura"}
          </Button>
        </div>
      </div>
    );
  }

  const tileSize = isCompact ? TILE_SIZE_MOBILE : TILE_SIZE_DESKTOP;
  const objective = classicObjective(ownProgress.starter_pokemon_id, ownProgress.world_scene);
  const scenePlayers = players.filter((player) => player.world_scene === ownProgress.world_scene && player.trainer_id);
  const bedroomPotionTaken = ownProgress.story_flags?.bedroom_potion_taken === true;

  return (
    <div className={`classic-world-shell classic-scene-${ownProgress.world_scene} relative h-full min-h-[420px] overflow-hidden bg-[#07100c]`}>
      <div
        ref={boardRef}
        className="classic-world-viewport h-full w-full overflow-auto outline-none"
        tabIndex={0}
        aria-label={`${ownScene.label}. Mapa do modo clássico.`}
      >
        <div
          className="classic-world-map relative isolate mx-auto my-auto shadow-[0_0_70px_rgba(0,0,0,0.75)]"
          data-scene={ownProgress.world_scene}
          style={{ width: ownScene.width * tileSize, height: ownScene.height * tileSize }}
        >
          <div
            className="classic-world-grid grid h-full w-full"
            style={{ gridTemplateColumns: `repeat(${ownScene.width}, ${tileSize}px)` }}
          >
            {ownScene.tiles.flatMap((row, y) => row.map((tile, x) => (
              <ClassicTile
                key={`${x}-${y}`}
                tile={tile}
                x={x}
                y={y}
                scene={ownProgress.world_scene}
                size={tileSize}
                onTarget={(targetX, targetY) => void walkToTile(targetX, targetY)}
                onStarter={() => {
                  if (!ownProgress.starter_pokemon_id) setStarterPickerOpen(true);
                }}
              />
            )))}
          </div>

          <SceneArchitecture tiles={ownScene.tiles} tileSize={tileSize} />
          <SceneLandmarks scene={ownProgress.world_scene} tileSize={tileSize} />

          {(ownScene.npcTrainers ?? []).map((npc) => {
            const defeated = ownProgress.story_flags?.[npc.defeatedFlag] === true;
            return (
              <div
                key={npc.id}
                className="classic-world-npc pointer-events-none absolute z-[90] flex items-center justify-center"
                style={{ left: npc.x * tileSize, top: npc.y * tileSize, width: tileSize, height: tileSize }}
                title={`${npc.name}${defeated ? " · derrotado" : " · treinador"}`}
              >
                <span className={`relative flex h-[84%] w-[84%] items-center justify-center rounded-t-full border-2 shadow-[0_3px_0_rgba(0,0,0,0.45)] ${defeated ? "border-slate-500 bg-slate-600" : "border-[#513323] bg-[#dc774c]"}`}>
                  <UserRound className="h-3/5 w-3/5 text-white" />
                  <span className={`absolute h-1.5 w-1.5 rounded-sm bg-[#2b1c17] ${facingPositionClass(npc.facing)}`} />
                </span>
                <span className="absolute left-1/2 top-full max-w-[7rem] -translate-x-1/2 truncate rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {npc.name}
                </span>
              </div>
            );
          })}

          {scenePlayers.map((player) => {
            const isOwn = player.user_id === userId;
            return (
              <button
                key={player.user_id}
                ref={isOwn ? tokenRef : undefined}
                type="button"
                className={`classic-world-player absolute z-[100] flex items-center justify-center transition-[left,top] duration-100 ease-linear ${isOwn ? "cursor-pointer" : "pointer-events-none"}`}
                style={{
                  left: player.tile_x * tileSize,
                  top: player.tile_y * tileSize,
                  width: tileSize,
                  height: tileSize,
                }}
                onClick={() => {
                  if (!isOwn) return;
                  setTokenSelected(true);
                  boardRef.current?.focus();
                }}
                onDoubleClick={() => {
                  if (isOwn && player.trainer_id) onOpenTrainer?.(player.trainer_id, player.trainer?.name ?? "Treinador");
                }}
                title={isOwn ? `${player.trainer?.name ?? "Treinador"} · selecionado` : player.trainer?.name ?? "Treinador"}
              >
                <span className={`relative flex h-[84%] w-[84%] items-center justify-center overflow-hidden rounded-full border-2 bg-[#f7d76b] shadow-[0_3px_0_rgba(0,0,0,0.45)] ${isOwn && tokenSelected ? "border-white ring-2 ring-primary ring-offset-2 ring-offset-black/60" : "border-[#402b20]"}`}>
                  {player.trainer?.image_url ? (
                    <img src={player.trainer.image_url} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" />
                  ) : (
                    <UserRound className="h-3/5 w-3/5 text-[#412d21]" />
                  )}
                  <span className={`absolute h-1.5 w-1.5 rounded-sm bg-[#412d21] ${facingPositionClass(player.facing)}`} />
                </span>
                <span className="absolute left-1/2 top-full max-w-[7rem] -translate-x-1/2 truncate rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {player.trainer?.name ?? "Treinador"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="classic-world-atmosphere pointer-events-none absolute inset-0 z-[25]" aria-hidden="true" />

      <div className="pointer-events-none absolute left-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] items-start gap-2">
        {toolbarSlot && <div className="pointer-events-auto w-48 max-w-[44vw] rounded-md border border-white/15 bg-black/75 p-2 shadow-lg backdrop-blur">{toolbarSlot}</div>}
        <div className="hidden max-w-sm rounded-md border border-white/15 bg-black/75 px-3 py-2 text-white shadow-lg backdrop-blur sm:block">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase text-[#ffcb48]">
            <MapPin className="h-3.5 w-3.5" /> {ownScene.label}
          </div>
          <p className="mt-1 text-xs text-white/75">{objective}</p>
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 z-30 max-w-[48vw] rounded-md border border-white/15 bg-black/75 px-3 py-2 text-right text-white shadow-lg backdrop-blur sm:hidden">
        <p className="truncate text-xs font-extrabold text-[#ffcb48]">{ownScene.label}</p>
        <p className="mt-0.5 line-clamp-2 text-[10px] text-white/70">{objective}</p>
      </div>

      <DPad
        disabled={!tokenSelected || !!activeEncounter}
        onMove={(dx, dy, facing) => {
          autoWalkRunRef.current += 1;
          autoWalkStopRef.current = false;
          setIsAutoWalking(false);
          setTokenSelected(true);
          move(dx, dy, facing);
          boardRef.current?.focus();
        }}
      />

      {isAutoWalking && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-md border border-white/15 bg-black/75 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur">
          <LoaderCircle className="h-4 w-4 animate-spin text-[#ffcb48]" />
          Caminhando
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 right-3 z-30 flex items-center gap-2 rounded-md border border-white/15 bg-black/70 px-3 py-2 text-xs font-bold text-white/75 shadow-lg backdrop-blur">
        <Footprints className="h-4 w-4 text-[#ffcb48]" />
        {scenePlayers.length} nesta área
      </div>

      <Dialog open={pcStorageOpen} onOpenChange={setPcStorageOpen}>
        <DialogContent className="max-w-md border-[#77b8d1]/35 bg-[#0b1216]">
          <DialogHeader>
            <div className="flex items-center gap-2 text-[#83d8f4]">
              <Monitor className="h-5 w-5" />
              <DialogTitle className="text-foreground">Depósito de itens</DialogTitle>
            </div>
          </DialogHeader>
          {bedroomPotionTaken ? (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              O depósito está vazio.
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-[#77b8d1]/25 bg-[#77b8d1]/5 p-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#77b8d1]/15 text-[#83d8f4]">
                <PackageOpen className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">Potion</p>
                <p className="text-xs text-muted-foreground">Quantidade: 1</p>
              </div>
              <Button
                size="sm"
                disabled={withdrawBedroomPotion.isPending}
                onClick={() => withdrawBedroomPotion.mutate()}
              >
                {withdrawBedroomPotion.isPending ? "Retirando..." : "Retirar"}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPcStorageOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StarterPicker
        open={starterPickerOpen && !ownProgress.starter_pokemon_id}
        onOpenChange={setStarterPickerOpen}
        species={filteredStarters}
        loading={startersLoading}
        search={starterSearch}
        onSearch={setStarterSearch}
        selectedId={selectedSpeciesId}
        onSelect={setSelectedSpeciesId}
        onConfirm={() => createStarter.mutate()}
        confirming={createStarter.isPending}
      />

      {false && <Dialog open={!!activeEncounter}>
        <DialogContent
          className="max-w-sm overflow-hidden border-[#e8c45a]/40 bg-[#0c1510] p-0"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="relative flex min-h-56 items-end justify-center overflow-hidden bg-[#16331f] px-6 pt-8">
            <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(135deg,transparent_45%,#2e6b3b_46%,#2e6b3b_54%,transparent_55%)] [background-size:28px_28px]" />
            <div className="relative mb-3 flex h-40 w-40 items-center justify-center rounded-full bg-[#b9df72]/25">
              <PokemonSpriteImage
                speciesName={activeEncounter?.species?.name}
                spriteUrl={activeEncounter?.species?.sprite_url}
                className="h-36 w-36 object-contain drop-shadow-[0_8px_2px_rgba(0,0,0,0.4)] [image-rendering:pixelated]"
              />
            </div>
          </div>
          <div className="p-5 text-center">
            <p className="text-xs font-extrabold uppercase text-[#ffcb48]">Um Pokémon selvagem apareceu!</p>
            <DialogHeader className="mt-1">
              <DialogTitle className="text-center text-2xl">{activeEncounter?.species?.name ?? "Pokémon selvagem"}</DialogTitle>
            </DialogHeader>
            <p className="mt-2 text-sm text-muted-foreground">
              Rank {RANK_LABELS[activeEncounter?.rank ?? "starter"]}. O combate será conectado a este encontro na próxima etapa.
            </p>
          </div>
          <DialogFooter className="border-t border-border p-4">
            <Button className="w-full" disabled={resolveEncounter.isPending} onClick={() => resolveEncounter.mutate()}>
              {resolveEncounter.isPending ? "Registrando..." : "Continuar exploração"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
      {activeEncounter && ownProgress.trainer_id && (
        <ClassicBattleWindow
          gameId={gameId}
          userId={userId}
          trainerId={ownProgress.trainer_id}
          encounterId={activeEncounter.id}
          onOpenTurnOrder={() => onOpenTurnOrder?.()}
          onOpenPokemon={onOpenPokemon}
          onCompleted={(completedEncounter) => {
            const defeatedFlag = completedEncounter.status === "won" && typeof completedEncounter.metadata?.npc_defeated_flag === "string"
              ? completedEncounter.metadata.npc_defeated_flag
              : null;
            if (defeatedFlag) {
              const nextFlags = { ...(ownProgress.story_flags ?? {}), [defeatedFlag]: true };
              qc.setQueryData<ClassicWorldPlayer[]>(playersQueryKey, (current) => (current ?? []).map((entry) => (
                entry.user_id === userId ? { ...entry, story_flags: nextFlags } : entry
              )));
              void (supabase.from("classic_player_progress" as never) as any)
                .update({ story_flags: nextFlags })
                .eq("game_id", gameId)
                .eq("user_id", userId);
            }
            setLocalEncounter(null);
            autoWalkStopRef.current = false;
            void qc.invalidateQueries({ queryKey: ["classic-pending-encounter", gameId, userId] });
            requestAnimationFrame(() => boardRef.current?.focus());
          }}
        />
      )}
    </div>
  );
}

function ClassicTile({
  tile,
  x,
  y,
  scene,
  size,
  onTarget,
  onStarter,
}: {
  tile: ClassicTileKind;
  x: number;
  y: number;
  scene: ClassicSceneId;
  size: number;
  onTarget: (x: number, y: number) => void;
  onStarter: () => void;
}) {
  const style = { width: size, height: size } as CSSProperties;
  const common = "classic-tile relative cursor-pointer overflow-visible [image-rendering:pixelated]";
  const tileClass: Record<ClassicTileKind, string> = {
    floor: "bg-[#d4b77c] border-[1px] border-[#bea064]/30",
    rug: "bg-[#b9433d] border-[3px] border-[#f0bf69]",
    wall: "bg-[#465c63] border-b-4 border-[#28383c]",
    door: "bg-[#8d5b35] border-x-4 border-[#51341f]",
    bed: "bg-[#e8d9b7] border-4 border-[#77553b]",
    desk: "bg-[#96603b] border-4 border-[#573921]",
    table: "bg-[#a46a3f] border-4 border-[#5c3b25]",
    shelf: "bg-[#88502e] border-b-4 border-[#4d2e1c]",
    stairs: "bg-[#d1ae72] border-[2px] border-[#785435]",
    pc: "bg-[#7f8b90] border-4 border-[#3f4b50]",
    tv: "bg-[#47555c] border-4 border-[#263238]",
    kitchen: "bg-[#c4c8ba] border-4 border-[#6e7669]",
    mother: "bg-[#d4b77c] border-[1px] border-[#bea064]/30",
    daisy: "bg-[#d4b77c] border-[1px] border-[#bea064]/30",
    plant: "bg-[#335f36] border-4 border-[#b2703d] rounded-t-full",
    grass: "bg-[#68a94f] border-[1px] border-[#5a9845]/35",
    "tall-grass": "bg-[#4c8d3f] border-[1px] border-[#3b7432]/60",
    path: "bg-[#d6b76f] border-[1px] border-[#c3a25e]/40",
    tree: "bg-[#245b38] border-b-4 border-[#123d27]",
    water: "bg-[#3a8fc6] border-[1px] border-[#69b9df]/50",
    flowers: "bg-[#69a84f] border-[1px] border-[#579543]/40",
    "building-home": "bg-[#e9d0a0] border-[2px] border-[#8a4939]",
    "building-lab": "bg-[#d9e2de] border-[2px] border-[#5f7775]",
    "building-center": "bg-[#f0eee4] border-[2px] border-[#be3535]",
    "building-mart": "bg-[#e9f0e6] border-[2px] border-[#3277a8]",
    "building-gym": "bg-[#c9c6bd] border-[2px] border-[#5d5850]",
    fence: "bg-[#6fa65b] border-b-4 border-[#c9d8d4]",
    ledge: "bg-[#63a44f] border-b-[7px] border-[#81543e]",
    mailbox: "bg-[#65a054] border-b-4 border-[#596b73]",
    "npc-mart": "bg-[#68a94f] border-[1px] border-[#5a9845]/35",
    "lab-floor": "bg-[#b9d0c5] border-[1px] border-[#9eb8ac]/50",
    counter: "bg-[#d8d2bc] border-4 border-[#6d7771]",
    machine: "bg-[#5a7178] border-4 border-[#293b40]",
    "starter-pod": "cursor-pointer bg-[#d8d2bc] border-4 border-[#6d7771]",
    professor: "bg-[#f1efe3] border-4 border-[#9d8b78]",
    sign: "bg-[#9a6338] border-4 border-[#5b381f]",
  };

  return (
    <div
      className={`${common} ${tileClass[tile]}`}
      style={style}
      data-tile={`${scene}:${x}:${y}:${tile}`}
      data-kind={tile}
      onClick={() => {
        if (tile === "starter-pod") onStarter();
        else onTarget(x, y);
      }}
    >
      {tile === "grass" && <span className="absolute bottom-1 left-1 h-2 w-1 rotate-[-18deg] border-l-2 border-[#3f7a37]" />}
      {tile === "tall-grass" && (
        <>
          <span className="absolute bottom-1 left-[18%] h-4 w-2 rotate-[-18deg] border-l-[3px] border-[#b2d568]" />
          <span className="absolute bottom-1 left-[46%] h-5 w-2 rotate-[12deg] border-l-[3px] border-[#9bc35b]" />
          <span className="absolute bottom-1 right-[14%] h-4 w-2 rotate-[24deg] border-l-[3px] border-[#b2d568]" />
        </>
      )}
      {tile === "path" && <span className="absolute left-[20%] top-[30%] h-1 w-2 bg-[#b99450]/50" />}
      {tile === "tree" && (
        <>
          <span className="absolute bottom-0 left-[42%] h-1/2 w-[18%] bg-[#6d4527]" />
          <span className="absolute left-[8%] top-[5%] h-[70%] w-[84%] rounded-[35%] bg-[#2f7a47] shadow-[inset_-5px_-6px_0_#1e5b35,inset_5px_5px_0_#4a9860]" />
        </>
      )}
      {tile === "water" && <span className="absolute left-[15%] top-1/2 h-1 w-[55%] bg-[#9bd8ee]/70" />}
      {tile === "stairs" && (
        <div className="absolute inset-[12%] flex flex-col justify-evenly">
          <span className="h-[12%] bg-[#765137]" /><span className="h-[12%] bg-[#765137]" /><span className="h-[12%] bg-[#765137]" /><span className="h-[12%] bg-[#765137]" />
        </div>
      )}
      {tile === "pc" && <Monitor className="absolute left-1/2 top-1/2 h-3/5 w-3/5 -translate-x-1/2 -translate-y-1/2 text-[#9de7f7]" />}
      {tile === "tv" && <span className="absolute inset-[18%] border-2 border-[#1e292d] bg-[#80b9b8] shadow-[inset_0_0_7px_#d3ffff]" />}
      {tile === "kitchen" && <span className="absolute inset-x-[12%] top-[18%] h-[45%] border-2 border-[#687166] bg-[#e8eadf]" />}
      {(tile === "mother" || tile === "daisy") && (
        <span className={`absolute left-1/2 top-1/2 flex h-[78%] w-[68%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-t-full border-2 border-[#5e3340] ${tile === "mother" ? "bg-[#df6f88]" : "bg-[#8fc8df]"}`}>
          <UserRound className="h-3/4 w-3/4 text-white" />
        </span>
      )}
      {tile === "flowers" && (
        <div className="absolute inset-0 grid grid-cols-2 place-items-center text-[10px] font-black text-[#fff1a8]">
          <span>+</span><span className="text-[#f08387]">+</span><span className="text-[#f08387]">+</span><span>+</span>
        </div>
      )}
      {(tile === "building-home" || tile === "building-lab" || tile === "building-center" || tile === "building-mart" || tile === "building-gym") && (
        <span className={`absolute inset-x-0 top-0 h-[35%] shadow-[inset_0_-4px_0_rgba(0,0,0,0.3)] ${tile === "building-mart" ? "bg-[#4d91bd]" : tile === "building-gym" ? "bg-[#777168]" : "bg-[#a94b43]"}`} />
      )}
      {tile === "fence" && (
        <>
          <span className="absolute left-0 top-[35%] h-[18%] w-full bg-[#dbe3de] shadow-[0_2px_0_#687c78]" />
          <span className="absolute left-[42%] top-[15%] h-[70%] w-[18%] bg-[#eef2ef] shadow-[2px_0_0_#687c78]" />
        </>
      )}
      {tile === "ledge" && <span className="absolute inset-x-0 bottom-0 h-[25%] bg-[#6a4233] opacity-70" />}
      {tile === "mailbox" && <span className="absolute left-1/2 top-[18%] h-[52%] w-[62%] -translate-x-1/2 rounded-t bg-[#dce4e5] shadow-[inset_-3px_-3px_0_#66777b]" />}
      {tile === "npc-mart" && (
        <span className="absolute left-1/2 top-1/2 flex h-[78%] w-[68%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-t-full border-2 border-[#33454b] bg-[#5aa4cb] shadow-[0_3px_0_rgba(0,0,0,0.35)]">
          <UserRound className="h-3/4 w-3/4 text-white" />
        </span>
      )}
      {tile === "starter-pod" && (
        <span className="absolute left-1/2 top-1/2 flex h-[55%] w-[55%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-[#292929] bg-white shadow-md">
          <span className="absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-[#e34842]" />
          <span className="relative h-2 w-2 rounded-full border-2 border-[#292929] bg-white" />
        </span>
      )}
      {tile === "machine" && <span className="absolute left-1/2 top-1/2 h-1/3 w-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#87d8d0] shadow-[0_0_6px_#87d8d0]" />}
      {tile === "professor" && <UserRound className="absolute left-1/2 top-1/2 h-3/4 w-3/4 -translate-x-1/2 -translate-y-1/2 text-[#6e4840]" />}
      {tile === "sign" && <span className="absolute left-1/2 top-[15%] h-1/2 w-[80%] -translate-x-1/2 border-2 border-[#4b2d1b] bg-[#c88a4e]" />}
    </div>
  );
}

const BUILDING_KINDS = new Set<ClassicTileKind>([
  "building-home",
  "building-lab",
  "building-center",
  "building-mart",
  "building-gym",
]);

type BuildingBlock = {
  kind: ClassicTileKind;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function findBuildingBlocks(tiles: ClassicTileKind[][]): BuildingBlock[] {
  const visited = new Set<string>();
  const blocks: BuildingBlock[] = [];

  tiles.forEach((row, startY) => row.forEach((kind, startX) => {
    const startKey = `${startX}:${startY}`;
    if (!BUILDING_KINDS.has(kind) || visited.has(startKey)) return;

    const queue = [{ x: startX, y: startY }];
    visited.add(startKey);
    let minX = startX;
    let maxX = startX;
    let minY = startY;
    let maxY = startY;

    while (queue.length > 0) {
      const current = queue.shift()!;
      minX = Math.min(minX, current.x);
      maxX = Math.max(maxX, current.x);
      minY = Math.min(minY, current.y);
      maxY = Math.max(maxY, current.y);

      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = current.x + dx;
        const y = current.y + dy;
        const key = `${x}:${y}`;
        if (visited.has(key) || tiles[y]?.[x] !== kind) continue;
        visited.add(key);
        queue.push({ x, y });
      }
    }

    blocks.push({ kind, minX, minY, maxX, maxY });
  }));

  return blocks;
}

function SceneArchitecture({ tiles, tileSize }: { tiles: ClassicTileKind[][]; tileSize: number }) {
  const blocks = useMemo(() => findBuildingBlocks(tiles), [tiles]);

  return blocks.map((block, index) => {
    const width = (block.maxX - block.minX + 1) * tileSize;
    const height = (block.maxY - block.minY + 1) * tileSize;
    return (
      <div
        key={`${block.kind}-${block.minX}-${block.minY}-${index}`}
        className={`classic-building classic-building--${block.kind.replace("building-", "")}`}
        style={{
          left: block.minX * tileSize,
          top: block.minY * tileSize,
          width,
          height,
        }}
        aria-hidden="true"
      >
        <span className="classic-building__roof" />
        <span className="classic-building__facade">
          <i className="classic-building__window classic-building__window--left" />
          <i className="classic-building__window classic-building__window--right" />
          <i className="classic-building__trim" />
        </span>
      </div>
    );
  });
}

function SceneLandmarks({ scene, tileSize }: { scene: ClassicSceneId; tileSize: number }) {
  if (scene !== "pallet") return null;
  const labels = [
    { text: "SUA CASA", x: 5, y: 5, width: 5 },
    { text: "CASA DO RIVAL", x: 14, y: 5, width: 5 },
    { text: "LAB. OAK", x: 13, y: 11, width: 7 },
  ];
  return labels.map((label) => (
    <div
      key={label.text}
      className="pointer-events-none absolute z-[70] text-center text-[10px] font-black tracking-widest text-white drop-shadow-[0_2px_0_#552e29]"
      style={{ left: label.x * tileSize, top: label.y * tileSize, width: label.width * tileSize }}
    >
      {label.text}
    </div>
  ));
}

function StarterPicker({
  open,
  onOpenChange,
  species,
  loading,
  search,
  onSearch,
  selectedId,
  onSelect,
  onConfirm,
  confirming,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  species: StarterSpecies[];
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const selected = species.find((entry) => entry.id === selectedId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <DialogTitle className="text-foreground">Escolha seu primeiro parceiro</DialogTitle>
          </div>
          <p className="text-sm text-muted-foreground">O Professor permite que cada treinador escolha uma espécie nativa de Kanto.</p>
        </DialogHeader>
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Procurar espécie" className="pl-9" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-background p-1">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando espécies...</p>
          ) : species.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma espécie encontrada.</p>
          ) : species.map((entry) => {
            const active = entry.id === selectedId;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelect(entry.id)}
                className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left hover:bg-accent ${active ? "bg-primary/10 ring-1 ring-primary" : ""}`}
              >
                <PokemonSpriteImage
                  speciesName={entry.name}
                  spriteUrl={entry.sprite_url}
                  className="h-12 w-12 object-contain [image-rendering:pixelated]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{entry.name}</span>
                  <span className="text-xs text-muted-foreground">#{entry.dex_number ?? "?"} · {RANK_LABELS[entry.suggested_rank ?? "starter"]}</span>
                </span>
                {active && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button disabled={!selected || confirming} onClick={onConfirm}>
            {confirming ? "Criando parceiro..." : selected ? `Escolher ${selected.name}` : "Escolher"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DPad({
  disabled,
  onMove,
}: {
  disabled: boolean;
  onMove: (dx: number, dy: number, facing: ClassicFacing) => void;
}) {
  const buttonClass = "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-md border border-white/20 bg-black/75 text-white shadow-lg backdrop-blur hover:bg-primary disabled:opacity-35";
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-30 grid grid-cols-3 grid-rows-3 gap-1 sm:hidden">
      <span />
      <button className={buttonClass} disabled={disabled} onPointerDown={() => onMove(0, -1, "up")} aria-label="Mover para cima"><ArrowUp className="h-5 w-5" /></button>
      <span />
      <button className={buttonClass} disabled={disabled} onPointerDown={() => onMove(-1, 0, "left")} aria-label="Mover para esquerda"><ArrowLeft className="h-5 w-5" /></button>
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-black/45 text-[#ffcb48]"><Compass className="h-4 w-4" /></div>
      <button className={buttonClass} disabled={disabled} onPointerDown={() => onMove(1, 0, "right")} aria-label="Mover para direita"><ArrowRight className="h-5 w-5" /></button>
      <span />
      <button className={buttonClass} disabled={disabled} onPointerDown={() => onMove(0, 1, "down")} aria-label="Mover para baixo"><ArrowDown className="h-5 w-5" /></button>
      <span />
    </div>
  );
}

function facingPositionClass(facing: ClassicFacing) {
  if (facing === "up") return "left-1/2 top-0 -translate-x-1/2";
  if (facing === "down") return "bottom-0 left-1/2 -translate-x-1/2";
  if (facing === "left") return "left-0 top-1/2 -translate-y-1/2";
  return "right-0 top-1/2 -translate-y-1/2";
}
