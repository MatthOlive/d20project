import { useCallback, useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type PointerEvent as ReactPointerEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowLeftRight, Backpack, CircleDot, Dices, DoorOpen, GripHorizontal, Heart, LoaderCircle, MoveDiagonal2, Shield, Sparkles, Swords, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PokemonSpriteImage } from "@/components/PokemonSpriteImage";
import { painPenaltyFor } from "@/components/SheetRolls";
import { computeMoveStats, parseMoveExtras, type MoveData } from "@/components/MoveRollDialog";
import { ClassicMoveRollDialog, type BattleMoveRollOptions } from "@/components/ClassicMoveRollDialog";
import { resolveMoveAccuracy } from "@/lib/move-resolution";
import {
  chooseNpcReaction,
  reactionAvailability,
  resolveBattleReaction,
  type BattleReaction,
  type ReactionAvailability,
} from "@/lib/classic-battle-reactions";
import { calculateClassicVictoryReward, normalizeVictoryRank } from "@/lib/classic-battle-victories";
import {
  damageDeltaFromMultiplier,
  damageMultiplierFor,
  preferredPokemonSprite,
  rollD6,
  type Rank,
} from "@/lib/pokerole";
import { useGameSpriteStyle } from "@/hooks/use-game-sprite-style";
import { cn } from "@/lib/utils";

function ClassicBattleDialogContent({ className, children, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="pointer-events-none fixed inset-0 z-50 bg-transparent" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 border border-border bg-background p-6 shadow-lg duration-200",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

type BattleSide = "player" | "opponent";
type BattlePhase = "choose_pokemon" | "initiative" | "active" | "finished";

export type ClassicBattleEncounter = {
  id: string;
  species_id: string;
  rank: Rank;
  status: "pending" | "in_battle" | "won" | "lost" | "resolved" | "fled";
  wild_pokemon_id: string | null;
  player_pokemon_id: string | null;
  battle_phase: BattlePhase;
  active_side: BattleSide | null;
  player_initiative: number | null;
  opponent_initiative: number | null;
  player_actions: number;
  opponent_actions: number;
  round_no: number;
  metadata?: Record<string, unknown> | null;
};

type SpeciesData = {
  id: string;
  name: string;
  dex_number: number | null;
  sprite_url: string | null;
  types: string[];
  base_attrs: Record<string, number>;
  abilities: string[];
};

type BattlePokemon = {
  id: string;
  nickname: string | null;
  rank: Rank;
  team_slot: number | null;
  current_attrs: Record<string, number>;
  social_attrs: Record<string, number>;
  social_attr_points: Record<string, number>;
  social_attr_bonus: Record<string, number>;
  skills: Record<string, number>;
  hp: number;
  current_hp: number | null;
  status: string[];
  image_url: string | null;
  is_shiny: boolean | null;
  victories: number;
  battles: number;
  species: SpeciesData;
};

type MoveLink = { pokemon_id: string; moves: MoveData | null };

type InventoryItem = { name: string; qty: number; desc?: string };
type PotionStock = Record<string, { count: number; used: number; max: number }>;
type TrainerBattleInventory = {
  id: string;
  name: string;
  rank: Rank;
  bag_list: InventoryItem[];
  battle_items_list: InventoryItem[];
  potions: PotionStock;
  pokedex: Record<string, { name: string; captured: boolean; sprite_url?: string | null }>;
  attr_points: Record<string, number>;
  attr_bonus: Record<string, number>;
  skills: Record<string, number>;
};

type CaptureBallKey = "pokeball" | "greatball" | "ultraball" | "masterball";
type InventorySource = "potions" | "bag_list" | "battle_items_list";
type UsableBattleItem = {
  source: InventorySource;
  index: number;
  stockKey?: string;
  name: string;
  qty: number;
  desc?: string;
  supported: boolean;
};

type PendingVictoryReward = {
  pokemon_id: string;
  opponent_pokemon_id: string;
  amount: number;
  base: number;
  opponent_pokemon_rank: string;
  compared_player_rank: string;
  compared_opponent_rank: string;
  rank_difference: number;
  factor: number;
  operation: "same" | "multiply" | "divide";
};

type TrainerMoneySettlement = {
  operation: "gain" | "loss";
  amount: number;
  calculated_amount: number;
  previous_money: number;
  new_money: number;
  difference_multiplier: number;
};

const CAPTURE_BALLS: Record<CaptureBallKey, { label: string; pool: number; aliases: string[] }> = {
  pokeball: { label: "Poké Ball", pool: 4, aliases: ["pokeball", "pokebola"] },
  greatball: { label: "Great Ball", pool: 5, aliases: ["greatball", "greatbola"] },
  ultraball: { label: "Ultra Ball", pool: 6, aliases: ["ultraball", "ultrabola"] },
  masterball: { label: "Master Ball", pool: 0, aliases: ["masterball", "masterbola"] },
};

const CAPTURE_SUCCESSES: Record<Rank, number> = {
  starter: 3,
  beginner: 4,
  amateur: 6,
  ace: 8,
  pro: 9,
  master: 12,
};

const POTION_DATA: Record<string, { label: string; heal: number | "full"; aliases: string[] }> = {
  potion: { label: "Potion", heal: 2, aliases: ["potion", "pocao"] },
  super: { label: "Super Potion", heal: 4, aliases: ["superpotion", "superpocao"] },
  hyper: { label: "Hyper Potion", heal: 14, aliases: ["hyperpotion", "hiperpocao"] },
  max: { label: "Max Potion", heal: "full", aliases: ["maxpotion", "maxpocao"] },
  fullrestore: { label: "Full Restore", heal: "full", aliases: ["fullrestore", "restauracaototal"] },
  oranberry: { label: "Oran Berry", heal: 1, aliases: ["oranberry"] },
  sitrusberry: { label: "Sitrus Berry", heal: 3, aliases: ["sitrusberry"] },
  energyroot: { label: "Energy Root", heal: 14, aliases: ["energyroot"] },
  energypowder: { label: "Energy Powder", heal: 4, aliases: ["energypowder"] },
  berryjuice: { label: "Berry Juice", heal: 2, aliases: ["berryjuice"] },
  freshwater: { label: "Fresh Water", heal: 4, aliases: ["freshwater"] },
  sodapop: { label: "Soda Pop", heal: 5, aliases: ["sodapop"] },
  lemonade: { label: "Lemonade", heal: 6, aliases: ["lemonade"] },
  moomoomilk: { label: "MooMoo Milk", heal: 7, aliases: ["moomoomilk"] },
};

const STATUS_CURES: Record<string, { label: string; conditions: string[] | "all"; aliases: string[] }> = {
  antidote: { label: "Antidote", conditions: ["poison"], aliases: ["antidote", "pechaberry"] },
  awakening: { label: "Awakening", conditions: ["sleep", "asleep"], aliases: ["awakening", "chestoberry"] },
  burnheal: { label: "Burn Heal", conditions: ["burn"], aliases: ["burnheal", "rawstberry"] },
  iceheal: { label: "Ice Heal", conditions: ["frozen", "freeze"], aliases: ["iceheal", "aspearberry"] },
  paralyzeheal: { label: "Paralyze Heal", conditions: ["paralysis", "paralyzed"], aliases: ["paralyzeheal", "cheriberry"] },
  fullheal: { label: "Full Heal", conditions: "all", aliases: ["fullheal", "lumberry", "healpowder"] },
};

type AttackResult = {
  hit: boolean;
  damage: number;
  defenderHp: number;
  attackerHp: number;
  accuracySuccesses: number;
  required: number;
  reaction: BattleReaction;
  reactionSucceeded: boolean;
};

type PendingPlayerReaction = ReactionAvailability & {
  attackerName: string;
  defenderName: string;
  moveName: string;
  resolve: (choice: BattleReaction) => void;
};

type BattleWindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  gameId: string;
  userId: string;
  trainerId: string;
  encounterId: string;
  onOpenTurnOrder: () => void;
  onOpenPokemon?: (id: string, name: string) => void;
  onCompleted: (encounter: ClassicBattleEncounter) => void;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const BATTLE_WINDOW_MARGIN = 8;
const BATTLE_WINDOW_MIN_WIDTH = 420;
const BATTLE_WINDOW_MIN_HEIGHT = 520;

function initialBattleWindowFrame(): BattleWindowFrame {
  if (typeof window === "undefined") return { x: 24, y: 24, width: 980, height: 760 };
  const availableWidth = Math.max(280, window.innerWidth - BATTLE_WINDOW_MARGIN * 2);
  const availableHeight = Math.max(360, window.innerHeight - BATTLE_WINDOW_MARGIN * 2);
  const width = Math.min(980, availableWidth);
  const height = Math.min(760, availableHeight);
  return {
    x: Math.max(BATTLE_WINDOW_MARGIN, (window.innerWidth - width) / 2),
    y: Math.max(BATTLE_WINDOW_MARGIN, (window.innerHeight - height) / 2),
    width,
    height,
  };
}

function clampBattleWindowFrame(frame: BattleWindowFrame): BattleWindowFrame {
  if (typeof window === "undefined") return frame;
  const maxWidth = Math.max(280, window.innerWidth - BATTLE_WINDOW_MARGIN * 2);
  const maxHeight = Math.max(360, window.innerHeight - BATTLE_WINDOW_MARGIN * 2);
  const minWidth = Math.min(BATTLE_WINDOW_MIN_WIDTH, maxWidth);
  const minHeight = Math.min(BATTLE_WINDOW_MIN_HEIGHT, maxHeight);
  const width = Math.min(maxWidth, Math.max(minWidth, frame.width));
  const height = Math.min(maxHeight, Math.max(minHeight, frame.height));
  return {
    width,
    height,
    x: Math.min(Math.max(BATTLE_WINDOW_MARGIN, frame.x), window.innerWidth - width - BATTLE_WINDOW_MARGIN),
    y: Math.min(Math.max(BATTLE_WINDOW_MARGIN, frame.y), window.innerHeight - height - BATTLE_WINDOW_MARGIN),
  };
}

function normalizeItemName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function captureBallKey(name: string): CaptureBallKey | null {
  const normalized = normalizeItemName(name);
  const match = (Object.entries(CAPTURE_BALLS) as [CaptureBallKey, (typeof CAPTURE_BALLS)[CaptureBallKey]][])
    .find(([, ball]) => ball.aliases.includes(normalized));
  return match?.[0] ?? null;
}

function potionKey(name: string) {
  const normalized = normalizeItemName(name);
  return Object.entries(POTION_DATA).find(([, item]) => item.aliases.includes(normalized))?.[0] ?? null;
}

function statusCureKey(name: string) {
  const normalized = normalizeItemName(name);
  return Object.entries(STATUS_CURES).find(([, item]) => item.aliases.includes(normalized))?.[0] ?? null;
}

function pokemonName(p: BattlePokemon | null | undefined) {
  return p?.nickname?.trim() || p?.species?.name || "Pokémon";
}

function attr(p: BattlePokemon, name: string) {
  return Number(p.current_attrs?.[name] ?? p.species?.base_attrs?.[name] ?? 1);
}

function currentHp(p: BattlePokemon) {
  return Math.max(0, Number(p.current_hp ?? p.hp ?? 0));
}

function frontSprite(p: BattlePokemon, style: "pixel" | "3d") {
  return p.image_url ?? preferredPokemonSprite(p.species.name, p.species.sprite_url, !!p.is_shiny, style);
}

function backSprite(p: BattlePokemon, style: "pixel" | "3d") {
  if (style === "pixel" && p.species.dex_number && p.species.dex_number <= 1025) {
    const shiny = p.is_shiny ? "shiny/" : "";
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${shiny}${p.species.dex_number}.png`;
  }
  return frontSprite(p, style);
}

function statusDamage(p: BattlePokemon) {
  const lowered = (p.status ?? []).map((entry) => entry.toLowerCase());
  return Number(lowered.some((entry) => entry.includes("poison")))
    + Number(lowered.some((entry) => entry.includes("burn")));
}

export function ClassicBattleWindow({
  gameId,
  userId,
  trainerId,
  encounterId,
  onOpenTurnOrder,
  onOpenPokemon,
  onCompleted,
}: Props) {
  const qc = useQueryClient();
  const spriteStyle = useGameSpriteStyle(gameId);
  const opponentRunningRef = useRef(false);
  const [movesOpen, setMovesOpen] = useState(false);
  const [selectedBattleMove, setSelectedBattleMove] = useState<MoveData | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState<"abilities" | "status" | "attrs" | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingPlayerReaction, setPendingPlayerReaction] = useState<PendingPlayerReaction | null>(null);
  const [battleMessage, setBattleMessage] = useState("Um Pokémon selvagem apareceu!");
  const [attributeBonuses, setAttributeBonuses] = useState<Record<string, Record<string, number>>>({});
  const [windowFrame, setWindowFrame] = useState<BattleWindowFrame>(initialBattleWindowFrame);

  useEffect(() => {
    const keepWindowVisible = () => setWindowFrame((current) => clampBattleWindowFrame(current));
    window.addEventListener("resize", keepWindowVisible);
    return () => window.removeEventListener("resize", keepWindowVisible);
  }, []);

  const startWindowDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startFrame = windowFrame;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    const move = (moveEvent: PointerEvent) => {
      setWindowFrame(clampBattleWindowFrame({
        ...startFrame,
        x: startFrame.x + moveEvent.clientX - startX,
        y: startFrame.y + moveEvent.clientY - startY,
      }));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }, [windowFrame]);

  const startWindowResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startFrame = windowFrame;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";

    const move = (moveEvent: PointerEvent) => {
      setWindowFrame(clampBattleWindowFrame({
        ...startFrame,
        width: startFrame.width + moveEvent.clientX - startX,
        height: startFrame.height + moveEvent.clientY - startY,
      }));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }, [windowFrame]);

  const encounterKey = useMemo(() => ["classic-battle", encounterId] as const, [encounterId]);
  const { data: encounter } = useQuery({
    queryKey: encounterKey,
    queryFn: async () => {
      const { data, error } = await (supabase.from("classic_encounters" as never) as any)
        .select("id,species_id,rank,status,wild_pokemon_id,player_pokemon_id,battle_phase,active_side,player_initiative,opponent_initiative,player_actions,opponent_actions,round_no,metadata")
        .eq("id", encounterId)
        .single();
      if (error) throw error;
      return data as ClassicBattleEncounter;
    },
    refetchOnWindowFocus: false,
  });

  const { data: campaignSettings = {} } = useQuery({
    queryKey: ["classic-campaign-settings", gameId],
    queryFn: async () => {
      const { data } = await (supabase.from("classic_campaigns" as never) as any)
        .select("settings")
        .eq("game_id", gameId)
        .maybeSingle();
      return (data?.settings ?? {}) as Record<string, unknown>;
    },
  });

  const { data: team = [] } = useQuery({
    queryKey: ["classic-battle-team", trainerId, spriteStyle],
    queryFn: async () => {
      const { data, error } = await (supabase.from("pokemon") as any)
        .select("id,nickname,rank,team_slot,current_attrs,social_attrs,social_attr_points,social_attr_bonus,skills,hp,current_hp,status,image_url,is_shiny,victories,battles,species:species_id(id,name,dex_number,sprite_url,types,base_attrs,abilities)")
        .eq("owner_trainer_id", trainerId)
        .not("team_slot", "is", null)
        .order("team_slot");
      if (error) throw error;
      return (data ?? []) as BattlePokemon[];
    },
  });

  const { data: trainerInventory } = useQuery({
    queryKey: ["classic-battle-inventory", trainerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainers")
        .select("id,name,rank,bag_list,battle_items_list,potions,pokedex,attr_points,attr_bonus,skills")
        .eq("id", trainerId)
        .single();
      if (error) throw error;
      return data as unknown as TrainerBattleInventory;
    },
  });

  const combatantIds = useMemo(
    () => [encounter?.wild_pokemon_id, encounter?.player_pokemon_id].filter(Boolean) as string[],
    [encounter?.player_pokemon_id, encounter?.wild_pokemon_id],
  );

  const { data: combatants = [] } = useQuery({
    queryKey: ["classic-battle-combatants", encounterId, combatantIds.join(","), spriteStyle],
    enabled: combatantIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase.from("pokemon") as any)
        .select("id,nickname,rank,team_slot,current_attrs,social_attrs,social_attr_points,social_attr_bonus,skills,hp,current_hp,status,image_url,is_shiny,victories,battles,species:species_id(id,name,dex_number,sprite_url,types,base_attrs,abilities)")
        .in("id", combatantIds);
      if (error) throw error;
      return (data ?? []) as BattlePokemon[];
    },
  });

  const { data: moveLinks = [] } = useQuery({
    queryKey: ["classic-battle-moves", combatantIds.join(",")],
    enabled: combatantIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase.from("pokemon_moves") as any)
        .select("pokemon_id,moves:move_id(id,name,type,power,accuracy_stat,accuracy_skill,damage_stat,effect,category)")
        .in("pokemon_id", combatantIds);
      if (error) throw error;
      return (data ?? []) as MoveLink[];
    },
  });

  const wild = combatants.find((entry) => entry.id === encounter?.wild_pokemon_id) ?? null;
  const player = combatants.find((entry) => entry.id === encounter?.player_pokemon_id) ?? null;
  const opponentController: "wild" | "trainer_npc" = encounter?.metadata?.opponent_kind === "trainer"
    || typeof encounter?.metadata?.trainer_id === "string"
    ? "trainer_npc"
    : "wild";
  const firstSide: BattleSide = Number(encounter?.player_initiative ?? 0) >= Number(encounter?.opponent_initiative ?? 0)
    ? "player"
    : "opponent";
  const playerActionLocked = encounter?.metadata?.player_action_locked === true;
  const awaitingPlayerSwitch = encounter?.metadata?.awaiting_player_switch === true;
  const healthySwitchOptions = team.filter((entry) => entry.id !== player?.id && currentHp(entry) > 0);
  const battleAttr = useCallback((pokemon: BattlePokemon, name: string) => (
    attr(pokemon, name) + Number(attributeBonuses[pokemon.id]?.[name] ?? 0)
  ), [attributeBonuses]);
  const withBattleAttributeBonuses = useCallback((pokemon: BattlePokemon) => {
    const bonuses = attributeBonuses[pokemon.id] ?? {};
    if (Object.keys(bonuses).length === 0) return pokemon;
    const currentAttrs = { ...(pokemon.current_attrs ?? {}) };
    for (const [name, bonus] of Object.entries(bonuses)) {
      currentAttrs[name] = attr(pokemon, name) + Number(bonus ?? 0);
    }
    return { ...pokemon, current_attrs: currentAttrs };
  }, [attributeBonuses]);
  const availableBalls = useMemo(() => (trainerInventory?.battle_items_list ?? [])
    .map((item, index) => ({ item, index, key: captureBallKey(item.name) }))
    .filter((entry): entry is { item: InventoryItem; index: number; key: CaptureBallKey } => !!entry.key && Number(entry.item.qty ?? 0) > 0), [trainerInventory?.battle_items_list]);
  const usableBattleItems = useMemo<UsableBattleItem[]>(() => {
    if (!trainerInventory) return [];
    const structured = Object.entries(trainerInventory.potions ?? {})
      .filter(([, stock]) => Number(stock?.count ?? 0) > 0)
      .map(([stockKey, stock], index) => ({
        source: "potions" as const,
        index,
        stockKey,
        name: POTION_DATA[stockKey]?.label ?? stockKey,
        qty: Number(stock.count ?? 0),
        supported: !!POTION_DATA[stockKey],
      }));
    const fromList = (source: "bag_list" | "battle_items_list", list: InventoryItem[]) => list
      .map((item, index) => ({
        source,
        index,
        name: item.name,
        qty: Number(item.qty ?? 0),
        desc: item.desc,
        supported: !!potionKey(item.name) || !!statusCureKey(item.name),
      }))
      .filter((item) => item.qty > 0 && !captureBallKey(item.name));
    return [
      ...structured,
      ...fromList("battle_items_list", trainerInventory.battle_items_list ?? []),
      ...fromList("bag_list", trainerInventory.bag_list ?? []),
    ];
  }, [trainerInventory]);
  const movesFor = useCallback(
    (pokemonId: string) => moveLinks.filter((entry) => entry.pokemon_id === pokemonId).map((entry) => entry.moves).filter(Boolean) as MoveData[],
    [moveLinks],
  );

  const refreshBattle = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: encounterKey }),
      qc.invalidateQueries({ queryKey: ["classic-battle-combatants", encounterId] }),
      qc.invalidateQueries({ queryKey: ["pokemon", gameId] }),
      qc.invalidateQueries({ queryKey: ["characters", gameId] }),
      qc.invalidateQueries({ queryKey: ["classic-battle-inventory", trainerId] }),
      qc.invalidateQueries({ queryKey: ["classic-battle-team", trainerId] }),
      qc.invalidateQueries({ queryKey: ["classic-progress", gameId, userId] }),
    ]);
  }, [encounterId, encounterKey, gameId, qc, trainerId, userId]);

  const askPlayerReaction = useCallback((request: Omit<PendingPlayerReaction, "resolve">) => (
    new Promise<BattleReaction>((resolve) => {
      setPendingPlayerReaction({ ...request, resolve });
      setBattleMessage(`${request.attackerName} usou ${request.moveName}: ${request.attackSuccesses} sucesso(s). Escolha sua reação.`);
    })
  ), []);

  const answerPlayerReaction = useCallback((choice: BattleReaction) => {
    setPendingPlayerReaction((pending) => {
      pending?.resolve(choice);
      return null;
    });
  }, []);

  const postRoll = useCallback(async (body: string, rollData: Record<string, unknown>, kind = "roll") => {
    const { error } = await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind,
      body,
      roll_data: rollData as never,
    });
    if (error) throw error;
  }, [gameId, userId]);

  const postBattleEvent = useCallback(async (body: string, details: Record<string, unknown> = {}) => {
    const { error } = await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind: "system",
      body,
      roll_data: { v: "classic-battle-event-1", ...details } as never,
    });
    if (error) throw error;
  }, [gameId, userId]);

  const putInitiative = useCallback(async (p: BattlePokemon, successes: number) => {
    await supabase.from("initiative").delete().eq("game_id", gameId).eq("character_ref", p.id);
    const { error } = await supabase.from("initiative").insert({
      game_id: gameId,
      character_kind: "pokemon",
      character_ref: p.id,
      character_name: pokemonName(p),
      image_url: frontSprite(p, spriteStyle),
      successes,
      position: 0,
    });
    if (error) throw error;
    void qc.invalidateQueries({ queryKey: ["initiative", gameId] });
  }, [gameId, qc, spriteStyle]);

  const registerBattleEntry = useCallback(async (
    pokemon: BattlePokemon,
    metadata: Record<string, unknown>,
  ) => {
    const participantIds = Array.isArray(metadata.participant_pokemon_ids)
      ? metadata.participant_pokemon_ids.filter((id): id is string => typeof id === "string")
      : [];
    if (participantIds.includes(pokemon.id)) return metadata;

    const { data, error: readError } = await supabase
      .from("pokemon")
      .select("battles")
      .eq("id", pokemon.id)
      .single();
    if (readError) throw readError;
    const nextBattles = Number(data.battles ?? 0) + 1;
    const { error: updateError } = await supabase
      .from("pokemon")
      .update({ battles: nextBattles })
      .eq("id", pokemon.id);
    if (updateError) throw updateError;

    await postBattleEvent(`${pokemonName(pokemon)} entrou na batalha.`, {
      event: "pokemon_entered_battle",
      pokemonId: pokemon.id,
      battles: nextBattles,
    });
    return { ...metadata, participant_pokemon_ids: [...participantIds, pokemon.id] };
  }, [postBattleEvent]);

  const appendPendingTrainerVictory = useCallback(async (
    defeatedOpponent: BattlePokemon,
    metadata: Record<string, unknown>,
  ) => {
    if (!player || metadata.opponent_kind !== "trainer") return metadata;
    const existing = Array.isArray(metadata.pending_victory_rewards)
      ? metadata.pending_victory_rewards.filter((entry): entry is PendingVictoryReward => (
          !!entry && typeof entry === "object" && typeof (entry as PendingVictoryReward).opponent_pokemon_id === "string"
        ))
      : [];
    if (existing.some((entry) => entry.opponent_pokemon_id === defeatedOpponent.id)) return metadata;

    const reward = calculateClassicVictoryReward({
      opponentPokemonRank: defeatedOpponent.rank,
      playerPokemonRank: player.rank,
      opponentKind: "trainer",
      playerTrainerRank: trainerInventory?.rank,
      opponentTrainerRank: metadata.opponent_trainer_rank,
    });
    return {
      ...metadata,
      pending_victory_rewards: [
        ...existing,
        {
          pokemon_id: player.id,
          opponent_pokemon_id: defeatedOpponent.id,
          amount: reward.amount,
          base: reward.base,
          opponent_pokemon_rank: reward.opponentPokemonRank,
          compared_player_rank: reward.comparedPlayerRank,
          compared_opponent_rank: reward.comparedOpponentRank,
          rank_difference: reward.rankDifference,
          factor: reward.factor,
          operation: reward.operation,
        },
      ],
    };
  }, [player, trainerInventory?.rank]);

  const advanceOpponentOrFinish = useCallback(async (nextSide: BattleSide = "player") => {
    if (!encounter || !wild) return false;
    const metadata = (encounter.metadata ?? {}) as Record<string, unknown>;
    const teamIds = Array.isArray(metadata.opponent_team_ids)
      ? metadata.opponent_team_ids.filter((id): id is string => typeof id === "string")
      : [];
    const defeatedIds = Array.isArray(metadata.opponent_defeated_ids)
      ? metadata.opponent_defeated_ids.filter((id): id is string => typeof id === "string")
      : [];
    const nextDefeatedIds = [...new Set([...defeatedIds, wild.id])];
    const nextOpponentId = teamIds.find((id) => !nextDefeatedIds.includes(id));
    if (!nextOpponentId) return false;

    const { data: nextOpponent, error: nextError } = await (supabase.from("pokemon") as any)
      .select("id,nickname,rank,team_slot,current_attrs,social_attrs,social_attr_points,social_attr_bonus,skills,hp,current_hp,status,image_url,is_shiny,victories,battles,species:species_id(id,name,dex_number,sprite_url,types,base_attrs,abilities)")
      .eq("id", nextOpponentId)
      .single();
    if (nextError) throw nextError;
    const typedNextOpponent = nextOpponent as BattlePokemon;
    const metadataWithVictory = await appendPendingTrainerVictory(wild, metadata);
    const metadataWithParticipant = await registerBattleEntry(typedNextOpponent, {
      ...metadataWithVictory,
      opponent_defeated_ids: nextDefeatedIds,
    });

    await supabase.from("initiative").delete().eq("game_id", gameId).eq("character_ref", wild.id);
    await putInitiative(typedNextOpponent, Number(encounter.opponent_initiative ?? 0));
    const { error } = await (supabase.from("classic_encounters" as never) as any)
      .update({
        wild_pokemon_id: typedNextOpponent.id,
        species_id: typedNextOpponent.species.id,
        rank: typedNextOpponent.rank,
        active_side: nextSide,
        opponent_actions: nextSide === "opponent" ? 0 : Number(encounter.opponent_actions ?? 0),
        metadata: { ...metadataWithParticipant, player_action_locked: false },
      })
      .eq("id", encounter.id);
    if (error) throw error;

    await postBattleEvent(`${pokemonName(wild)} foi derrotado. ${String(metadata.opponent_name ?? "O treinador")} enviou ${pokemonName(typedNextOpponent)}!`, {
      event: "opponent_pokemon_switched",
      defeatedPokemonId: wild.id,
      pokemonId: typedNextOpponent.id,
      remainingPokemon: teamIds.length - nextDefeatedIds.length,
    });
    setBattleMessage(`${String(metadata.opponent_name ?? "O treinador")} enviou ${pokemonName(typedNextOpponent)}!`);
    await refreshBattle();
    return true;
  }, [appendPendingTrainerVictory, encounter, gameId, postBattleEvent, putInitiative, refreshBattle, registerBattleEntry, wild]);

  const requestPlayerReplacement = useCallback(async (nextSide: BattleSide, advancesRound: boolean) => {
    if (!encounter || !player) return;
    const trainerBattle = encounter.metadata?.opponent_kind === "trainer";
    const replacementMessage = trainerBattle
      ? `${pokemonName(player)} foi derrotado. Escolha outro Pokemon ou conceda a vitoria.`
      : `${pokemonName(player)} foi derrotado. Escolha outro Pokemon ou tente fugir.`;
    await supabase.from("initiative").delete().eq("game_id", gameId).eq("character_ref", player.id);
    const { error } = await (supabase.from("classic_encounters" as never) as any)
      .update({
        active_side: null,
        metadata: {
          ...(encounter.metadata ?? {}),
          awaiting_player_switch: true,
          replacement_next_side: nextSide,
          replacement_advances_round: advancesRound,
          player_action_locked: false,
        },
      })
      .eq("id", encounter.id);
    if (error) throw error;
    setMovesOpen(false);
    setSelectedBattleMove(null);
    setSwitchOpen(false);
    await postBattleEvent(replacementMessage, {
      event: "pokemon_fainted",
      pokemonId: player.id,
      replacementNextSide: nextSide,
      advancesRound,
    });
    setBattleMessage(replacementMessage);
    await refreshBattle();
  }, [encounter, gameId, player, postBattleEvent, refreshBattle]);

  const changePlayerPokemon = useCallback(async (chosen: BattlePokemon) => {
    if (!encounter || !player || busy || chosen.id === player.id || currentHp(chosen) <= 0) return;
    const forced = encounter.metadata?.awaiting_player_switch === true;
    if (!forced && encounter.active_side !== "player") return;

    setBusy(true);
    try {
      const nextSide: BattleSide = forced && encounter.metadata?.replacement_next_side === "player"
        ? "player"
        : "opponent";
      const currentMetadata = (encounter.metadata ?? {}) as Record<string, unknown>;
      const metadataWithParticipant = await registerBattleEntry(chosen, currentMetadata);
      const advancesRound = !forced || currentMetadata.replacement_advances_round === true;
      const beginsNewRound = advancesRound && (
        (nextSide === "opponent" && firstSide === "opponent")
        || (nextSide === "player" && firstSide === "player")
      );
      const nextRound = Number(encounter.round_no ?? 1) + (beginsNewRound ? 1 : 0);

      await supabase.from("initiative").delete().eq("game_id", gameId).eq("character_ref", player.id);
      await putInitiative(chosen, Number(encounter.player_initiative ?? 0));
      const { error } = await (supabase.from("classic_encounters" as never) as any)
        .update({
          player_pokemon_id: chosen.id,
          active_side: nextSide,
          player_actions: 0,
          opponent_actions: nextSide === "opponent" ? 0 : Number(encounter.opponent_actions ?? 0),
          round_no: nextRound,
          metadata: {
            ...metadataWithParticipant,
            awaiting_player_switch: false,
            replacement_next_side: null,
            replacement_advances_round: false,
            player_action_locked: false,
          },
        })
        .eq("id", encounter.id);
      if (error) throw error;

      setSwitchOpen(false);
      await postBattleEvent(`${pokemonName(player)} voltou. ${pokemonName(chosen)} entrou em batalha.`, {
        event: "pokemon_switched",
        previousPokemonId: player.id,
        pokemonId: chosen.id,
        forced,
        nextSide,
      });
      setBattleMessage(forced && nextSide === "player"
        ? `Vai, ${pokemonName(chosen)}! Seu turno comeÃ§ou.`
        : `Vai, ${pokemonName(chosen)}! Agora Ã© o turno do oponente.`);
      await refreshBattle();
    } catch (error) {
      toast.error(`NÃ£o foi possÃ­vel trocar de PokÃ©mon: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, encounter, firstSide, gameId, player, postBattleEvent, putInitiative, refreshBattle, registerBattleEntry]);

  const fleeBattle = useCallback(async () => {
    if (!encounter || !player || !trainerInventory || busy || encounter.metadata?.awaiting_player_switch !== true) return;
    if (encounter.metadata?.opponent_kind === "trainer") {
      toast.error("Nao e possivel fugir de uma batalha contra treinador.");
      return;
    }
    setBusy(true);
    try {
      const dexterity = 1
        + Number(trainerInventory.attr_points?.dexterity ?? 0)
        + Number(trainerInventory.attr_bonus?.dexterity ?? 0);
      const athletic = Number(trainerInventory.skills?.Athletic ?? 0);
      const pool = Math.max(0, dexterity + athletic);
      const roll = rollD6(pool);
      const escaped = roll.successes >= 1;
      await postRoll(`${trainerInventory.name || "Treinador"} tentou fugir`, {
        v: "classic-flee-1",
        label: "Fuga Â· Destreza + Athletic",
        pool,
        dice: roll.dice,
        successes: roll.successes,
        requiredSuccesses: 1,
        dexterity,
        athletic,
        escaped,
      });

      if (!escaped) {
        setBattleMessage(`A fuga falhou: ${roll.successes}/1 sucesso. Escolha outro PokÃ©mon ou tente novamente.`);
        await postBattleEvent(`${trainerInventory.name || "Treinador"} tentou fugir, mas nÃ£o conseguiu.`, {
          event: "flee_failed",
          pool,
          successes: roll.successes,
        });
        return;
      }

      const { error } = await (supabase.from("classic_encounters" as never) as any)
        .update({
          status: "fled",
          battle_phase: "finished",
          active_side: null,
          resolved_at: new Date().toISOString(),
          metadata: {
            ...(encounter.metadata ?? {}),
            awaiting_player_switch: false,
            replacement_next_side: null,
            replacement_advances_round: false,
            fled: true,
          },
        })
        .eq("id", encounter.id);
      if (error) throw error;
      await supabase.from("initiative").delete().eq("game_id", gameId).in("character_ref", [player.id, wild?.id].filter(Boolean) as string[]);
      await postBattleEvent(`${trainerInventory.name || "Treinador"} fugiu da batalha.`, {
        event: "battle_fled",
        pool,
        successes: roll.successes,
      });
      setBattleMessage("VocÃª fugiu da batalha.");
      await refreshBattle();
    } catch (error) {
      toast.error(`NÃ£o foi possÃ­vel fugir: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, encounter, gameId, player, postBattleEvent, postRoll, refreshBattle, trainerInventory, wild?.id]);

  const finishBattle = useCallback(async (winner: BattleSide) => {
    if (!encounter) return;
    const result = winner === "player" ? "won" : "lost";
    const { data: currentEncounter, error: encounterReadError } = await (supabase.from("classic_encounters" as never) as any)
      .select("status,metadata")
      .eq("id", encounter.id)
      .single();
    if (encounterReadError) throw encounterReadError;
    if (["won", "lost", "resolved", "fled"].includes(String(currentEncounter.status))) return;

    let victoryReward: ReturnType<typeof calculateClassicVictoryReward> | null = null;
    let nextVictories: number | null = null;
    const currentMetadata = (currentEncounter.metadata ?? {}) as Record<string, unknown>;

    if (currentMetadata.opponent_kind === "trainer") {
      const finishedMetadata = winner === "player" && wild
        ? await appendPendingTrainerVictory(wild, currentMetadata)
        : currentMetadata;
      const { data: settlementData, error: settlementError } = await (supabase.rpc as any)(
        "finish_classic_trainer_battle",
        {
          p_encounter_id: encounter.id,
          p_result: result,
          p_metadata: finishedMetadata,
        },
      );
      if (settlementError) throw settlementError;
      const settlement = settlementData as TrainerMoneySettlement;
      const pendingRewards = Array.isArray(finishedMetadata.pending_victory_rewards)
        ? finishedMetadata.pending_victory_rewards as PendingVictoryReward[]
        : [];
      const victoriesEarned = pendingRewards.reduce((total, reward) => total + Number(reward.amount ?? 0), 0);

      if (player) await supabase.from("initiative").delete().eq("game_id", gameId).eq("character_ref", player.id);
      const opponentTeamIds = Array.isArray(finishedMetadata.opponent_team_ids)
        ? finishedMetadata.opponent_team_ids.filter((id): id is string => typeof id === "string")
        : wild ? [wild.id] : [];
      if (opponentTeamIds.length > 0) {
        await supabase.from("initiative").delete().eq("game_id", gameId).in("character_ref", opponentTeamIds);
      }

      const opponentName = String(finishedMetadata.opponent_name ?? "treinador");
      const moneyMessage = settlement.operation === "gain"
        ? `Voce ganhou $${settlement.amount}. Saldo: $${settlement.new_money}.`
        : `Voce perdeu $${settlement.amount}. Saldo: $${settlement.new_money}.`;
      await postBattleEvent(
        winner === "player"
          ? `Vitoria contra ${opponentName}. ${victoriesEarned} vitoria(s) foram distribuidas entre os Pokemon. ${moneyMessage}`
          : `Vitoria concedida a ${opponentName}. ${moneyMessage}`,
        {
          event: "trainer_battle_finished",
          winner,
          opponentName,
          victoriesEarned,
          settlement,
        },
      );
      setBattleMessage(winner === "player"
        ? `Vitoria! ${victoriesEarned} vitoria(s) distribuidas. Voce ganhou $${settlement.amount}.`
        : `Voce concedeu a vitoria e perdeu $${settlement.amount}.`);
      await refreshBattle();
      return;
    }

    if (winner === "player" && player && wild) {
      const opponentTrainerId = typeof currentMetadata.opponent_trainer_id === "string"
        ? currentMetadata.opponent_trainer_id
        : typeof currentMetadata.trainer_id === "string"
          ? currentMetadata.trainer_id
          : null;
      const isTrainerBattle = currentMetadata.opponent_kind === "trainer" || !!opponentTrainerId;
      let opponentTrainerRank: unknown = currentMetadata.opponent_trainer_rank;
      if (isTrainerBattle && opponentTrainerId) {
        const { data: opponentTrainer } = await supabase
          .from("trainers")
          .select("rank")
          .eq("id", opponentTrainerId)
          .maybeSingle();
        opponentTrainerRank = opponentTrainer?.rank ?? opponentTrainerRank;
      }

      const { data: currentPlayerPokemon, error: pokemonReadError } = await supabase
        .from("pokemon")
        .select("victories,rank")
        .eq("id", player.id)
        .single();
      if (pokemonReadError) throw pokemonReadError;

      victoryReward = calculateClassicVictoryReward({
        opponentPokemonRank: wild.rank,
        playerPokemonRank: currentPlayerPokemon.rank,
        opponentKind: isTrainerBattle ? "trainer" : "wild",
        playerTrainerRank: trainerInventory?.rank,
        opponentTrainerRank,
      });
      nextVictories = Number(currentPlayerPokemon.victories ?? 0) + victoryReward.amount;
    }

    const finishedMetadata = victoryReward && player
      ? {
          ...currentMetadata,
          victory_reward: {
            pokemon_id: player.id,
            amount: victoryReward.amount,
            previous_total: nextVictories! - victoryReward.amount,
            new_total: nextVictories,
            base: victoryReward.base,
            opponent_kind: opponentController === "trainer_npc" ? "trainer" : "wild",
            opponent_pokemon_rank: victoryReward.opponentPokemonRank,
            compared_player_rank: victoryReward.comparedPlayerRank,
            compared_opponent_rank: victoryReward.comparedOpponentRank,
            rank_difference: victoryReward.rankDifference,
            factor: victoryReward.factor,
            operation: victoryReward.operation,
          },
        }
      : currentMetadata;

    const { data: finishedEncounter, error: finishError } = await (supabase.from("classic_encounters" as never) as any)
      .update({
        status: result,
        battle_phase: "finished",
        active_side: null,
        resolved_at: new Date().toISOString(),
        metadata: finishedMetadata,
      })
      .eq("id", encounter.id)
      .in("status", ["pending", "in_battle"])
      .select("id")
      .maybeSingle();
    if (finishError) throw finishError;
    if (!finishedEncounter) return;

    if (winner === "player" && player && victoryReward && nextVictories !== null) {
      const { error: victoriesError } = await supabase
        .from("pokemon")
        .update({ victories: nextVictories })
        .eq("id", player.id);
      if (victoriesError) throw victoriesError;
    }
    if (player) await supabase.from("initiative").delete().eq("game_id", gameId).eq("character_ref", player.id);
    if (wild) await supabase.from("initiative").delete().eq("game_id", gameId).eq("character_ref", wild.id);
    const capturedOpponent = currentMetadata.captured === true;
    await postBattleEvent(winner === "player"
      ? `${pokemonName(player)} ${capturedOpponent ? `ajudou a capturar ${pokemonName(wild)}` : `venceu a batalha contra ${pokemonName(wild)}`} e recebeu ${victoryReward?.amount ?? 0} vitória(s). Total: ${nextVictories ?? 0}.`
      : `${pokemonName(player)} foi derrotado por ${pokemonName(wild)}.`, {
      event: "battle_finished",
      winner,
      playerPokemonId: player?.id,
      opponentPokemonId: wild?.id,
      victoriesEarned: victoryReward?.amount ?? 0,
      victoriesTotal: nextVictories,
      victoryReward,
    });
    setBattleMessage(winner === "player"
      ? `Vitória! ${pokemonName(player)} recebeu ${victoryReward?.amount ?? 0} vitória(s).`
      : "Sua equipe foi derrotada.");
    await refreshBattle();
  }, [appendPendingTrainerVictory, encounter, gameId, opponentController, player, postBattleEvent, refreshBattle, trainerInventory?.rank, wild]);

  const concedeTrainerBattle = useCallback(async () => {
    if (!encounter || busy || encounter.metadata?.opponent_kind !== "trainer") return;
    setBusy(true);
    try {
      await finishBattle("opponent");
    } catch (error) {
      toast.error(`Nao foi possivel conceder a vitoria: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, encounter, finishBattle]);

  const applyEndTurnConditions = useCallback(async (p: BattlePokemon) => {
    const damage = statusDamage(p);
    if (damage <= 0) return currentHp(p);
    const nextHp = Math.max(0, currentHp(p) - damage);
    const { error } = await supabase.from("pokemon").update({ current_hp: nextHp }).eq("id", p.id);
    if (error) throw error;
    await postRoll(`${pokemonName(p)} sofreu dano de condição`, {
      v: "classic-condition-1",
      pokemonName: pokemonName(p),
      conditions: p.status,
      damage,
      remainingHp: nextHp,
    });
    setBattleMessage(`${pokemonName(p)} sofreu ${damage} de dano por condição.`);
    return nextHp;
  }, [postRoll]);

  const performMove = useCallback(async (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    move: MoveData,
    actionsAlreadyMade: number,
    defenderController: "player" | "wild" | "trainer_npc",
    defenderActionsAlreadyMade: number,
    modifiers?: BattleMoveRollOptions,
  ): Promise<AttackResult> => {
    const attackerWithBonuses = withBattleAttributeBonuses(attacker);
    const stats = computeMoveStats(move, {
      current_attrs: attackerWithBonuses.current_attrs,
      social_attrs: attacker.social_attrs,
      social_attr_points: attacker.social_attr_points,
      social_attr_bonus: attacker.social_attr_bonus,
      skills: attacker.skills,
      base_attrs: attacker.species.base_attrs,
    }, attacker.species.types ?? []);
    const pain = painPenaltyFor(currentHp(attacker), attacker.hp);
    const resolvedActions = modifiers?.actionsAlreadyMade ?? actionsAlreadyMade;
    const criticalMargin = modifiers?.criticalMargin ?? 0;
    const accuracyPool = Math.max(0, stats.accPool + Number(modifiers?.accuracyBonus ?? 0) - pain);
    const accuracy = rollD6(accuracyPool);
    const outcome = resolveMoveAccuracy(accuracy.successes, resolvedActions, criticalMargin);
    let damage = 0;
    let damageDice: number[] = [];
    let damagePool = 0;
    let effectiveness = "Neutro";

    const defenderPain = painPenaltyFor(currentHp(defender), defender.hp);
    const availability = reactionAvailability(
      accuracy.successes,
      Math.max(0, battleAttr(defender, "strength") + Number(defender.skills?.Clash ?? 0) - defenderPain),
      Math.max(0, battleAttr(defender, "dexterity") + Number(defender.skills?.Evasion ?? 0) - defenderPain),
      defenderActionsAlreadyMade,
    );
    let reactionChoice: BattleReaction = "none";

    if (outcome.isHit && !stats.isStatus && stats.dmgPool > 0 && (availability.canClash || availability.canEvade)) {
      if (defenderController === "player") {
        reactionChoice = await askPlayerReaction({
          ...availability,
          attackerName: pokemonName(attacker),
          defenderName: pokemonName(defender),
          moveName: move.name,
        });
      } else {
        const difficultyValue = String(campaignSettings.battle_difficulty ?? "normal");
        const difficulty = difficultyValue === "easy" || difficultyValue === "hard" ? difficultyValue : "normal";
        reactionChoice = chooseNpcReaction(availability, {
          difficulty,
          trainedByNpc: defenderController === "trainer_npc",
          attackerHp: currentHp(attacker),
          defenderHp: currentHp(defender),
        });
      }
    }

    const reaction = resolveBattleReaction(availability, reactionChoice, rollD6);

    if (outcome.isHit && !reaction.preventsMoveDamage && !stats.isStatus && stats.dmgPool > 0) {
      const defense = stats.isSpecial ? battleAttr(defender, "insight") : battleAttr(defender, "vitality");
      const eff = damageDeltaFromMultiplier(damageMultiplierFor(move.type, defender.species.types ?? []));
      effectiveness = eff.label;
      damagePool = eff.immune ? 0 : Math.max(0, stats.dmgPool
        + Number(modifiers?.damageBonus ?? 0)
        + Number(modifiers?.extraDamageBonus ?? 0)
        - pain
        + (outcome.isCritical ? 1 : 0)
        + eff.delta
        - defense);
      const rolled = eff.immune ? { dice: [] as number[], successes: 0 } : rollD6(damagePool);
      damageDice = rolled.dice;
      damage = eff.immune ? 0 : Math.max(1, rolled.successes);
    }

    const defenderDamage = reaction.choice === "clash" && reaction.succeeded ? 1 : damage;
    const defenderHp = Math.max(0, currentHp(defender) - defenderDamage);
    const attackerHp = Math.max(0, currentHp(attacker) - reaction.damageToAttacker);
    if (defenderDamage > 0) {
      const { error } = await supabase.from("pokemon").update({ current_hp: defenderHp }).eq("id", defender.id);
      if (error) throw error;
    }
    if (reaction.damageToAttacker > 0) {
      const { error } = await supabase.from("pokemon").update({ current_hp: attackerHp }).eq("id", attacker.id);
      if (error) throw error;
    }

    const extras = parseMoveExtras(move.effect);
    const chanceRolls = extras.chance.map((entry) => ({ ...entry, roll: rollD6(entry.count) }));
    const chanceTriggered = chanceRolls.some((entry) => entry.roll.dice.some((die) => die === 6));
    const inferredStatus = /poison/i.test(move.effect) ? "Poison" : (/burn/i.test(move.effect) ? "Burn" : null);
    if (outcome.isHit && !reaction.preventsMoveDamage && inferredStatus && (extras.chance.length === 0 || chanceTriggered)) {
      const nextStatus = Array.from(new Set([...(defender.status ?? []), inferredStatus]));
      await supabase.from("pokemon").update({ status: nextStatus }).eq("id", defender.id);
    }

    await postRoll(`${pokemonName(attacker)} used ${move.name}`, {
      v: "move-1",
      pokemonName: pokemonName(attacker),
      imageUrl: frontSprite(attacker, spriteStyle),
      hasStab: stats.hasStab,
      card: {
        name: move.name,
        type: move.type,
        power: move.power,
        accuracyText: stats.accuracyText,
        damagePoolText: stats.damagePoolText,
        effect: move.effect ?? "",
        category: move.category,
      },
      accuracy: {
        pool: accuracyPool,
        dice: accuracy.dice,
        successes: accuracy.successes,
        penalty: pain,
        isHit: outcome.isHit,
        crit: { margin: criticalMargin, actions: resolvedActions, required: outcome.requiredSuccesses, critRequired: outcome.criticalSuccesses, isCrit: outcome.isCritical },
      },
      damage: stats.isStatus ? null : {
        pool: damagePool,
        dice: damageDice,
        successes: defenderDamage,
        penalty: pain,
        isStatus: false,
        targetDef: stats.isSpecial ? battleAttr(defender, "insight") : battleAttr(defender, "vitality"),
        critBonus: outcome.isCritical ? 1 : 0,
        targets: [{
          name: pokemonName(defender),
          def: stats.isSpecial ? battleAttr(defender, "insight") : battleAttr(defender, "vitality"),
          defStat: stats.isSpecial ? "spdef" : "def",
          effLabel: effectiveness,
          finalDamage: defenderDamage,
          dice: damageDice,
          successes: defenderDamage,
          pool: damagePool,
        }],
      },
      reaction: {
        choice: reaction.choice,
        pool: reaction.pool,
        dice: reaction.dice,
        successes: reaction.successes,
        required: availability.attackSuccesses,
        actionNumber: availability.actionNumber,
        minimumPool: availability.minimumPool,
        succeeded: reaction.succeeded,
        damageToAttacker: reaction.damageToAttacker,
        preventedMoveDamage: reaction.preventsMoveDamage,
      },
      chance: chanceRolls.map((entry) => ({ label: entry.label, pool: entry.count, dice: entry.roll.dice, successes: entry.roll.dice.filter((die) => die === 6).length })),
    }, "move");

    if (reaction.choice === "clash" && reaction.succeeded) {
      setBattleMessage(`${pokemonName(defender)} venceu o Clash. Os dois Pokémon sofreram 1 de dano.`);
    } else if (reaction.choice === "evade" && reaction.succeeded) {
      setBattleMessage(`${pokemonName(defender)} evitou completamente o ataque com Evasion.`);
    } else if (reaction.choice !== "none") {
      setBattleMessage(`${pokemonName(defender)} falhou em ${reaction.choice === "clash" ? "Clash" : "Evasion"}. ${defenderDamage > 0 ? `Sofreu ${defenderDamage} de dano.` : "O move não causou dano."}`);
    } else {
      setBattleMessage(outcome.isHit
        ? `${pokemonName(attacker)} usou ${move.name}${defenderDamage > 0 ? ` e causou ${defenderDamage} de dano!` : "!"}`
        : `${pokemonName(attacker)} usou ${move.name}, mas falhou na ação ${resolvedActions + 1}.`);
    }
    return {
      hit: outcome.isHit,
      damage: defenderDamage,
      defenderHp,
      attackerHp,
      accuracySuccesses: accuracy.successes,
      required: outcome.requiredSuccesses,
      reaction: reaction.choice,
      reactionSucceeded: reaction.succeeded,
    };
  }, [askPlayerReaction, battleAttr, campaignSettings.battle_difficulty, postRoll, spriteStyle, withBattleAttributeBonuses]);

  const switchToOpponent = useCallback(async () => {
    if (!encounter || !player || busy) return;
    setBusy(true);
    try {
      const remaining = await applyEndTurnConditions(player);
      if (remaining <= 0) {
        await requestPlayerReplacement("opponent", true);
        return;
      }
      const nextRound = Number(encounter.round_no ?? 1) + (firstSide === "opponent" ? 1 : 0);
      await (supabase.from("classic_encounters" as never) as any)
        .update({
          active_side: "opponent",
          opponent_actions: 0,
          round_no: nextRound,
          metadata: { ...(encounter.metadata ?? {}), player_action_locked: false },
        })
        .eq("id", encounter.id);
      await postBattleEvent(`${pokemonName(player)} encerrou o turno.`, {
        event: "turn_passed",
        side: "player",
        nextSide: "opponent",
        round: nextRound,
      });
      await refreshBattle();
    } catch (error) {
      toast.error(`Não foi possível passar o turno: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [applyEndTurnConditions, busy, encounter, firstSide, player, postBattleEvent, refreshBattle, requestPlayerReplacement]);

  const choosePokemon = useCallback(async (chosen: BattlePokemon) => {
    if (!encounter || !wild || currentHp(chosen) <= 0) return;
    setBusy(true);
    try {
      const pool = Math.max(0, battleAttr(wild, "dexterity") + Number(wild.skills?.Alert ?? 0) - painPenaltyFor(currentHp(wild), wild.hp));
      const roll = rollD6(pool);
      await postRoll(`${pokemonName(wild)} · Initiative`, { ...roll, pool, label: `${pokemonName(wild)} · Initiative` });
      await putInitiative(wild, roll.successes);
      const metadataWithPlayer = await registerBattleEntry(
        chosen,
        (encounter.metadata ?? {}) as Record<string, unknown>,
      );
      const metadataWithParticipants = await registerBattleEntry(wild, metadataWithPlayer);
      const { error } = await (supabase.from("classic_encounters" as never) as any)
        .update({
          player_pokemon_id: chosen.id,
          status: "in_battle",
          battle_phase: "initiative",
          active_side: null,
          opponent_initiative: roll.successes,
          player_initiative: null,
          player_actions: 0,
          opponent_actions: 0,
          round_no: 1,
          metadata: { ...metadataWithParticipants, player_action_locked: false },
        })
        .eq("id", encounter.id);
      if (error) throw error;
      setBattleMessage(`${pokemonName(wild)} rolou ${roll.successes} sucesso(s). Role a iniciativa de ${pokemonName(chosen)}.`);
      onOpenTurnOrder();
      await refreshBattle();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [battleAttr, encounter, onOpenTurnOrder, postRoll, putInitiative, refreshBattle, registerBattleEntry, wild]);

  const rollPlayerInitiative = useCallback(async () => {
    if (!encounter || !player || encounter.player_initiative !== null) return;
    setBusy(true);
    try {
      const pool = Math.max(0, battleAttr(player, "dexterity") + Number(player.skills?.Alert ?? 0) - painPenaltyFor(currentHp(player), player.hp));
      const roll = rollD6(pool);
      await postRoll(`${pokemonName(player)} · Initiative`, { ...roll, pool, label: `${pokemonName(player)} · Initiative` });
      await putInitiative(player, roll.successes);
      const opponentInitiative = Number(encounter.opponent_initiative ?? 0);
      const first: BattleSide = roll.successes >= opponentInitiative ? "player" : "opponent";
      const { error } = await (supabase.from("classic_encounters" as never) as any)
        .update({
          player_initiative: roll.successes,
          battle_phase: "active",
          active_side: first,
          metadata: { ...(encounter.metadata ?? {}), player_action_locked: false },
        })
        .eq("id", encounter.id);
      if (error) throw error;
      setBattleMessage(first === "player" ? `${pokemonName(player)} age primeiro!` : `${pokemonName(wild)} age primeiro!`);
      onOpenTurnOrder();
      await refreshBattle();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [battleAttr, encounter, onOpenTurnOrder, player, postRoll, putInitiative, refreshBattle, wild]);

  const playerMove = useCallback(async (move: MoveData, modifiers?: BattleMoveRollOptions) => {
    if (!encounter || !player || !wild || encounter.active_side !== "player" || busy) return false;
    setBusy(true);
    setMovesOpen(false);
    try {
      const actionIndex = Number(encounter.player_actions ?? 0);
      const opponentReactionActions = Number(encounter.opponent_actions ?? 0);
      const result = await performMove(player, wild, move, actionIndex, opponentController, opponentReactionActions, modifiers);
      await (supabase.from("classic_encounters" as never) as any)
        .update({
          player_actions: actionIndex + 1,
          opponent_actions: opponentReactionActions + (result.reaction === "none" ? 0 : 1),
          metadata: {
            ...(encounter.metadata ?? {}),
            player_action_locked: !result.hit,
          },
        })
        .eq("id", encounter.id);
      if (result.defenderHp <= 0) {
        const opponentAdvanced = await advanceOpponentOrFinish("player");
        if (!opponentAdvanced) await finishBattle("player");
      }
      else if (result.attackerHp <= 0) await requestPlayerReplacement("player", false);
      else {
        if (!result.hit) setBattleMessage(`${pokemonName(player)} não conseguiu realizar a ação. Clique em Passar turno.`);
        await refreshBattle();
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }, [advanceOpponentOrFinish, busy, encounter, finishBattle, opponentController, performMove, player, refreshBattle, requestPlayerReplacement, wild]);

  const quickAction = useCallback(async (label: string, pool: number) => {
    if (!encounter || !player || encounter.active_side !== "player" || busy) return;
    setBusy(true);
    try {
      const actionIndex = Number(encounter.player_actions ?? 0);
      const finalPool = Math.max(0, pool - painPenaltyFor(currentHp(player), player.hp));
      const roll = rollD6(finalPool);
      const outcome = resolveMoveAccuracy(roll.successes, actionIndex, 0);
      await postRoll(`${pokemonName(player)} · ${label}`, {
        ...roll,
        pool: finalPool,
        label: `${pokemonName(player)} · ${label}`,
        requiredSuccesses: outcome.requiredSuccesses,
        actionNumber: actionIndex + 1,
      });
      await (supabase.from("classic_encounters" as never) as any)
        .update({
          player_actions: actionIndex + 1,
          metadata: {
            ...(encounter.metadata ?? {}),
            player_action_locked: !outcome.isHit,
          },
        })
        .eq("id", encounter.id);
      setBattleMessage(outcome.isHit
        ? `${label}: ${roll.successes} sucesso(s), precisava de ${outcome.requiredSuccesses}. Você ainda pode agir.`
        : `${label}: ${roll.successes} sucesso(s), precisava de ${outcome.requiredSuccesses}. Clique em Passar turno.`);
      await refreshBattle();
    } finally {
      setBusy(false);
    }
  }, [busy, encounter, player, postRoll, refreshBattle]);

  const capturePokemon = useCallback(async (ballKey: CaptureBallKey, inventoryIndex: number) => {
    if (!encounter || !wild || !trainerInventory || encounter.active_side !== "player" || encounter.round_no <= 1 || busy) return;
    const inventoryItem = trainerInventory.battle_items_list?.[inventoryIndex];
    if (!inventoryItem || captureBallKey(inventoryItem.name) !== ballKey || Number(inventoryItem.qty ?? 0) <= 0) {
      toast.error("Essa Poké Ball não está mais disponível na mochila.");
      return;
    }

    setBusy(true);
    try {
      const ball = CAPTURE_BALLS[ballKey];
      const hp = currentHp(wild);
      const halfHpBonus = hp <= Math.floor(Math.max(1, wild.hp) / 2) ? 1 : 0;
      const oneHpBonus = hp === 1 ? 1 : 0;
      const statusBonus = (wild.status ?? []).length > 0 ? 1 : 0;
      const guaranteedBonuses = halfHpBonus + oneHpBonus + statusBonus;
      const rankKey = String(wild.rank ?? "beginner").toLowerCase() as Rank;
      const required = CAPTURE_SUCCESSES[rankKey] ?? 4;
      const roll = ballKey === "masterball" ? { dice: [] as number[], successes: required } : rollD6(ball.pool);
      const totalSuccesses = ballKey === "masterball" ? required : roll.successes + guaranteedBonuses;
      const captured = ballKey === "masterball" || totalSuccesses >= required;

      const nextBattleItems = trainerInventory.battle_items_list.map((item, index) => index === inventoryIndex
        ? { ...item, qty: Number(item.qty ?? 0) - 1 }
        : item).filter((item) => item.qty > 0);
      const { error: inventoryError } = await supabase
        .from("trainers")
        .update({ battle_items_list: nextBattleItems })
        .eq("id", trainerId);
      if (inventoryError) throw inventoryError;

      await postRoll(`${trainerInventory.name || "Treinador"} tentou capturar ${pokemonName(wild)} com ${ball.label}`, {
        v: "classic-capture-1",
        label: `Captura · ${ball.label}`,
        target: pokemonName(wild),
        ball: ball.label,
        pool: ball.pool,
        dice: roll.dice,
        rolledSuccesses: roll.successes,
        guaranteedBonuses,
        bonuses: {
          halfHp: halfHpBonus,
          oneHp: oneHpBonus,
          negativeStatus: statusBonus,
        },
        successes: totalSuccesses,
        requiredSuccesses: required,
        captured,
        automatic: ballKey === "masterball",
      });

      if (!captured) {
        setCaptureOpen(false);
        setBattleMessage(`${pokemonName(wild)} escapou da ${ball.label}. ${totalSuccesses}/${required} sucessos.`);
        await refreshBattle();
        return;
      }

      const occupiedSlots = new Set(team.map((entry) => Number(entry.team_slot)).filter((slot) => slot >= 1 && slot <= 6));
      const freeSlot = [1, 2, 3, 4, 5, 6].find((slot) => !occupiedSlots.has(slot)) ?? null;
      const { error: pokemonError } = await supabase.from("pokemon").update({
        owner_id: userId,
        owner_trainer_id: trainerId,
        team_slot: freeSlot,
        ai_spawned: false,
        ai_scene_id: null,
        folder: null,
      }).eq("id", wild.id);
      if (pokemonError) throw pokemonError;

      const nextPokedex = {
        ...(trainerInventory.pokedex ?? {}),
        [wild.species.id]: {
          name: wild.species.name,
          captured: true,
          sprite_url: frontSprite(wild, spriteStyle),
        },
      };
      const { error: dexError } = await supabase.from("trainers").update({ pokedex: nextPokedex }).eq("id", trainerId);
      if (dexError) throw dexError;

      const { error: encounterError } = await (supabase.from("classic_encounters" as never) as any)
        .update({ metadata: { ...(encounter.metadata ?? {}), captured: true, capture_ball: ballKey } })
        .eq("id", encounter.id);
      if (encounterError) throw encounterError;

      setCaptureOpen(false);
      await finishBattle("player");
      setBattleMessage(`${pokemonName(wild)} foi capturado com ${ball.label} e enviado ${freeSlot ? "ao time" : "ao PC"}!`);
    } catch (error) {
      toast.error(`Não foi possível concluir a captura: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, encounter, finishBattle, postRoll, refreshBattle, spriteStyle, team, trainerId, trainerInventory, userId, wild]);

  const useBattleItem = useCallback(async (item: UsableBattleItem) => {
    if (!encounter || !player || !trainerInventory || encounter.active_side !== "player" || encounter.round_no <= 1 || busy || !item.supported) return;
    const healKey = potionKey(item.name);
    const cureKey = statusCureKey(item.name);
    const healData = healKey ? POTION_DATA[healKey] : null;
    const cureData = cureKey ? STATUS_CURES[cureKey] : null;
    if (!healData && !cureData) return;

    setBusy(true);
    try {
      const beforeHp = currentHp(player);
      const healAmount = healData ? (healData.heal === "full" ? player.hp - beforeHp : healData.heal) : 0;
      const nextHp = Math.min(player.hp, beforeHp + Math.max(0, healAmount));
      const shouldCureAll = healKey === "fullrestore" || cureData?.conditions === "all";
      const conditions = cureData && cureData.conditions !== "all" ? cureData.conditions : [];
      const nextStatus = shouldCureAll
        ? []
        : (player.status ?? []).filter((status) => !conditions.some((condition) => status.toLowerCase().includes(condition)));
      if (nextHp === beforeHp && nextStatus.length === (player.status ?? []).length) {
        toast.info("Esse item não teria efeito agora.");
        return;
      }

      const trainerUpdate: Record<string, unknown> = {};
      if (item.source === "potions" && item.stockKey) {
        const nextPotions = { ...(trainerInventory.potions ?? {}) };
        const stock = nextPotions[item.stockKey];
        if (!stock || stock.count <= 0) throw new Error("Item esgotado.");
        nextPotions[item.stockKey] = { ...stock, count: stock.count - 1, used: Number(stock.used ?? 0) + 1 };
        trainerUpdate.potions = nextPotions;
      } else {
        const sourceList = item.source === "bag_list" ? trainerInventory.bag_list : trainerInventory.battle_items_list;
        const nextList = sourceList.map((entry, index) => index === item.index
          ? { ...entry, qty: Number(entry.qty ?? 0) - 1 }
          : entry).filter((entry) => entry.qty > 0);
        trainerUpdate[item.source] = nextList;
      }

      const { error: trainerError } = await (supabase.from("trainers") as any).update(trainerUpdate).eq("id", trainerId);
      if (trainerError) throw trainerError;
      const { error: pokemonError } = await supabase.from("pokemon").update({ current_hp: nextHp, status: nextStatus }).eq("id", player.id);
      if (pokemonError) throw pokemonError;

      const recovered = nextHp - beforeHp;
      const cured = (player.status ?? []).filter((status) => !nextStatus.includes(status));
      await postBattleEvent(`${trainerInventory.name || "Treinador"} usou ${item.name} em ${pokemonName(player)}.`, {
        event: "item_used",
        item: item.name,
        pokemonId: player.id,
        pokemonName: pokemonName(player),
        recoveredHp: recovered,
        curedStatus: cured,
      });
      setItemsOpen(false);
      setBattleMessage(`${item.name} usado em ${pokemonName(player)}${recovered > 0 ? `: +${recovered} HP` : ""}${cured.length ? ` · curou ${cured.join(", ")}` : ""}.`);
      await refreshBattle();
    } catch (error) {
      toast.error(`Não foi possível usar o item: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, encounter, player, postBattleEvent, refreshBattle, trainerId, trainerInventory]);

  const maybeSwitchOpponentForTypeAdvantage = useCallback(async () => {
    if (!encounter || !player || !wild || opponentController !== "trainer_npc") return false;
    const metadata = (encounter.metadata ?? {}) as Record<string, unknown>;
    if (Number(metadata.last_opponent_switch_round ?? -1) === Number(encounter.round_no ?? 1)) return false;

    const rankChance: Record<string, number> = {
      starter: 0,
      beginner: 0.06,
      amateur: 0.16,
      ace: 0.3,
      pro: 0.44,
      champion: 0.58,
      master: 0.7,
    };
    const trainerRank = normalizeVictoryRank(metadata.opponent_trainer_rank);
    const difficulty = String(campaignSettings.battle_difficulty ?? "normal");
    const difficultyFactor = difficulty === "hard" ? 1.2 : difficulty === "easy" ? 0.65 : 1;
    const switchChance = Math.min(0.85, rankChance[trainerRank] * difficultyFactor);
    if (switchChance <= 0 || Math.random() >= switchChance) return false;

    const playerMoveTypes = movesFor(player.id)
      .filter((move) => Number(move.power ?? 0) > 0 && typeof move.type === "string")
      .map((move) => move.type);
    if (playerMoveTypes.length === 0) return false;
    const threatFor = (pokemon: BattlePokemon) => Math.max(
      ...playerMoveTypes.map((type) => damageMultiplierFor(type, pokemon.species.types ?? [])),
    );
    const currentThreat = threatFor(wild);
    if (currentThreat <= 1) return false;

    const teamIds = Array.isArray(metadata.opponent_team_ids)
      ? metadata.opponent_team_ids.filter((id): id is string => typeof id === "string")
      : [];
    const defeatedIds = Array.isArray(metadata.opponent_defeated_ids)
      ? metadata.opponent_defeated_ids.filter((id): id is string => typeof id === "string")
      : [];
    const reserveIds = teamIds.filter((id) => id !== wild.id && !defeatedIds.includes(id));
    if (reserveIds.length === 0) return false;

    const { data, error: reserveError } = await (supabase.from("pokemon") as any)
      .select("id,nickname,rank,team_slot,current_attrs,social_attrs,social_attr_points,social_attr_bonus,skills,hp,current_hp,status,image_url,is_shiny,victories,battles,species:species_id(id,name,dex_number,sprite_url,types,base_attrs,abilities)")
      .in("id", reserveIds);
    if (reserveError) throw reserveError;
    const candidates = ((data ?? []) as BattlePokemon[])
      .filter((candidate) => currentHp(candidate) > 0 && threatFor(candidate) < currentThreat)
      .sort((a, b) => threatFor(a) - threatFor(b));
    if (candidates.length === 0) return false;

    const bestThreat = threatFor(candidates[0]);
    const bestCandidates = candidates.filter((candidate) => threatFor(candidate) === bestThreat);
    const chosen = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
    const metadataWithParticipant = await registerBattleEntry(chosen, metadata);
    const nextRound = Number(encounter.round_no ?? 1) + (firstSide === "player" ? 1 : 0);

    await supabase.from("initiative").delete().eq("game_id", gameId).eq("character_ref", wild.id);
    await putInitiative(chosen, Number(encounter.opponent_initiative ?? 0));
    const { error } = await (supabase.from("classic_encounters" as never) as any)
      .update({
        wild_pokemon_id: chosen.id,
        species_id: chosen.species.id,
        rank: chosen.rank,
        active_side: "player",
        opponent_actions: 1,
        player_actions: 0,
        round_no: nextRound,
        metadata: {
          ...metadataWithParticipant,
          player_action_locked: false,
          last_opponent_switch_round: nextRound,
          opponent_switch_count: Number(metadata.opponent_switch_count ?? 0) + 1,
        },
      })
      .eq("id", encounter.id);
    if (error) throw error;

    await postBattleEvent(`${String(metadata.opponent_name ?? "O treinador")} recolheu ${pokemonName(wild)} e enviou ${pokemonName(chosen)} para reduzir a desvantagem de tipo.`, {
      event: "opponent_strategic_switch",
      previousPokemonId: wild.id,
      pokemonId: chosen.id,
      previousThreat: currentThreat,
      nextThreat: bestThreat,
      trainerRank,
      switchChance,
      round: nextRound,
    });
    setBattleMessage(`${String(metadata.opponent_name ?? "O treinador")} trocou para ${pokemonName(chosen)}. Seu turno comecou.`);
    await refreshBattle();
    return true;
  }, [campaignSettings.battle_difficulty, encounter, firstSide, gameId, movesFor, opponentController, player, postBattleEvent, putInitiative, refreshBattle, registerBattleEntry, wild]);

  const opponentTurn = useCallback(async () => {
    if (!encounter || !player || !wild || encounter.active_side !== "opponent" || opponentRunningRef.current) return;
    opponentRunningRef.current = true;
    setBusy(true);
    try {
      if (await maybeSwitchOpponentForTypeAdvantage()) return;
      const available = movesFor(wild.id);
      let actions = 0;
      let playerReactionActions = Number(encounter.player_actions ?? 0);
      if (available.length === 0) {
        setBattleMessage(`${pokemonName(wild)} não conhece nenhum move e perdeu o turno.`);
      } else {
        const difficulty = String(campaignSettings.battle_difficulty ?? "normal");
        let playerHp = currentHp(player);
        let opponentHp = currentHp(wild);
        const continueChance = opponentController === "trainer_npc"
          ? (difficulty === "hard" ? 0.9 : difficulty === "easy" ? 0.45 : 0.7)
          : (difficulty === "hard" ? 0.35 : difficulty === "easy" ? 0.1 : 0.2);
        const actionPoolFor = (move: MoveData) => {
          const stats = computeMoveStats(
            move,
            withBattleAttributeBonuses({ ...wild, current_hp: opponentHp }),
            wild.species.types ?? [],
          );
          return Math.max(0, stats.accPool - painPenaltyFor(opponentHp, wild.hp));
        };

        // Six is only a safety ceiling. The real limit is the growing success
        // requirement and whether the chosen move still has a large enough pool.
        while (actions < 6 && playerHp > 0 && opponentHp > 0) {
          if (actions > 0 && Math.random() > continueChance) break;
          const viableMoves = available.filter((move) => actionPoolFor(move) > actions);
          if (viableMoves.length === 0) break;
          const ranked = [...viableMoves].sort((a, b) => {
            const aEff = damageMultiplierFor(a.type, player.species.types ?? []);
            const bEff = damageMultiplierFor(b.type, player.species.types ?? []);
            return ((b.power || 0) * bEff) - ((a.power || 0) * aEff);
          });
          const move = difficulty === "easy"
            ? viableMoves[Math.floor(Math.random() * viableMoves.length)]
            : difficulty === "hard"
              ? ranked[0]
              : ranked[Math.floor(Math.random() * Math.min(2, ranked.length))];
          await sleep(actions === 0 ? 650 : 450);
          const result = await performMove(
            { ...wild, current_hp: opponentHp },
            { ...player, current_hp: playerHp },
            move,
            actions,
            "player",
            playerReactionActions,
          );
          actions += 1;
          if (result.reaction !== "none") playerReactionActions += 1;
          playerHp = result.defenderHp;
          opponentHp = result.attackerHp;
          await (supabase.from("classic_encounters" as never) as any)
            .update({ opponent_actions: actions, player_actions: playerReactionActions })
            .eq("id", encounter.id);
          if (!result.hit || playerHp <= 0 || opponentHp <= 0) break;
        }
        if (opponentHp <= 0) {
          const opponentAdvanced = await advanceOpponentOrFinish("player");
          if (!opponentAdvanced) await finishBattle("player");
          return;
        }
        if (playerHp <= 0) {
          await requestPlayerReplacement("player", true);
          return;
        }
      }
      const remaining = await applyEndTurnConditions(wild);
      if (remaining <= 0) {
        const opponentAdvanced = await advanceOpponentOrFinish("player");
        if (!opponentAdvanced) await finishBattle("player");
        return;
      }
      const nextRound = Number(encounter.round_no ?? 1) + (firstSide === "player" ? 1 : 0);
      await (supabase.from("classic_encounters" as never) as any)
        .update({
          active_side: "player",
          player_actions: 0,
          round_no: nextRound,
          metadata: { ...(encounter.metadata ?? {}), player_action_locked: false },
        })
        .eq("id", encounter.id);
      await postBattleEvent(`${pokemonName(wild)} encerrou o turno.`, {
        event: "turn_passed",
        side: "opponent",
        nextSide: "player",
        round: nextRound,
        actions,
        nextActionRequiredSuccesses: actions + 1,
      });
      setBattleMessage(`Turno de ${pokemonName(player)}.`);
      await refreshBattle();
    } catch (error) {
      toast.error(`Ação automática falhou: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      opponentRunningRef.current = false;
      setBusy(false);
    }
  }, [advanceOpponentOrFinish, applyEndTurnConditions, campaignSettings.battle_difficulty, encounter, finishBattle, firstSide, maybeSwitchOpponentForTypeAdvantage, movesFor, opponentController, performMove, player, postBattleEvent, refreshBattle, requestPlayerReplacement, wild, withBattleAttributeBonuses]);

  useEffect(() => {
    if (encounter?.battle_phase === "active" && encounter.active_side === "opponent") void opponentTurn();
  }, [encounter?.active_side, encounter?.battle_phase, opponentTurn]);

  async function leaveFinishedBattle() {
    if (!encounter) return;
    setBusy(true);
    try {
      const opponentTeamIds = Array.isArray(encounter.metadata?.opponent_team_ids)
        ? encounter.metadata.opponent_team_ids.filter((id): id is string => typeof id === "string")
        : wild ? [wild.id] : [];
      if (opponentTeamIds.length > 0 && encounter.metadata?.captured !== true) {
        const { error: pokemonError } = await supabase.from("pokemon").delete().in("id", opponentTeamIds);
        if (pokemonError) throw pokemonError;
      }
      const { error: encounterError } = await (supabase.from("classic_encounters" as never) as any)
        .update({ status: "resolved" })
        .eq("id", encounter.id);
      if (encounterError) throw encounterError;
      onCompleted(encounter);
    } catch (error) {
      toast.error(`Não foi possível voltar à rota: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  const finished = !!encounter && (
    encounter.battle_phase === "finished" || encounter.status === "won" || encounter.status === "lost"
  );

  useEffect(() => {
    if (!finished) return;
    setMovesOpen(false);
    setDetailsOpen(null);
    setAttributeBonuses({});
  }, [finished]);

  if (!encounter || !wild) {
    return (
      <Dialog open modal={false}>
        <ClassicBattleDialogContent className="max-w-sm">
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin" /> Preparando a batalha...
          </div>
        </ClassicBattleDialogContent>
      </Dialog>
    );
  }

  const playerMoves = player ? movesFor(player.id) : [];
  const selectedBattleMoveStats = selectedBattleMove && player
    ? computeMoveStats(selectedBattleMove, withBattleAttributeBonuses(player), player.species.types ?? [])
    : null;
  const playerHasTurn = encounter.battle_phase === "active" && encounter.active_side === "player";
  const playerCanAct = playerHasTurn && !busy && !playerActionLocked && !pendingPlayerReaction;
  const playerCanPass = playerHasTurn && !busy && !pendingPlayerReaction;
  const battleUtilitiesUnlocked = playerHasTurn && encounter.round_no > 1 && !busy && !pendingPlayerReaction;
  const opponentTeamIds = Array.isArray(encounter.metadata?.opponent_team_ids)
    ? encounter.metadata.opponent_team_ids.filter((id): id is string => typeof id === "string")
    : [];
  const opponentDefeatedIds = Array.isArray(encounter.metadata?.opponent_defeated_ids)
    ? encounter.metadata.opponent_defeated_ids.filter((id): id is string => typeof id === "string")
    : [];
  const opponentTeamRemaining = Math.max(1, opponentTeamIds.length - opponentDefeatedIds.length);
  const opponentName = typeof encounter.metadata?.opponent_name === "string"
    ? encounter.metadata.opponent_name
    : "Pokémon selvagem";
  const chosenDetails = player;

  return (
    <Dialog open modal={false}>
      <ClassicBattleDialogContent
        className="flex max-h-none max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-[#d8b85a]/45 bg-[#09110d] p-0 shadow-2xl"
        style={{
          left: windowFrame.x,
          top: windowFrame.y,
          width: windowFrame.width,
          height: windowFrame.height,
          transform: "none",
        }}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="sr-only"><DialogTitle>Batalha Pokémon</DialogTitle></DialogHeader>
        <div
          role="toolbar"
          aria-label="Mover janela de batalha"
          onPointerDown={startWindowDrag}
          className="flex h-10 shrink-0 touch-none cursor-grab select-none items-center justify-between border-b border-[#d8b85a]/30 bg-[#111b16] px-3 text-[#f6e8b4] active:cursor-grabbing"
        >
          <div className="flex min-w-0 items-center gap-2">
            <GripHorizontal className="h-5 w-5 shrink-0 text-[#d8b85a]" />
            <span className="truncate text-sm font-extrabold uppercase">Batalha Pokémon</span>
          </div>
          <span className="ml-3 truncate text-xs font-semibold text-white/55">
            {pokemonName(player)} vs. {opponentName} · {pokemonName(wild)}
            {opponentController === "trainer_npc" ? ` · ${opponentTeamRemaining} restante(s)` : ""}
          </span>
        </div>

        <div className="relative min-h-[220px] flex-1 overflow-hidden bg-[#79ad68]">
          <div className="absolute inset-0 bg-[linear-gradient(#9bd7dc_0_44%,#c4df8a_44%_58%,#6fa853_58%_100%)]" />
          <div className="absolute inset-x-0 top-[43%] h-10 bg-[repeating-linear-gradient(90deg,#a9cb78_0_22px,#bddb8d_22px_44px)] opacity-80" />
          <div className="absolute right-[8%] top-[31%] h-20 w-48 rounded-[50%] bg-[#d8e7a8]/75 shadow-[inset_0_-10px_0_rgba(70,120,55,0.18)]" />
          <div className="absolute bottom-[9%] left-[8%] h-24 w-60 rounded-[50%] bg-[#d6dea7]/75 shadow-[inset_0_-12px_0_rgba(70,120,55,0.2)]" />

          <BattleStatus pokemon={wild} className="absolute left-5 top-5 w-[min(340px,48%)]" />
          <div className="absolute right-[9%] top-[12%] flex h-48 w-48 items-end justify-center">
            <PokemonSpriteImage
              speciesName={wild.species.name}
              spriteUrl={frontSprite(wild, spriteStyle)}
              className="h-44 w-44 object-contain [image-rendering:pixelated] drop-shadow-[0_10px_2px_rgba(0,0,0,.25)]"
            />
          </div>

          {player && (
            <>
              <div className="absolute bottom-[8%] left-[11%] flex h-52 w-52 items-end justify-center">
                <PokemonSpriteImage
                  speciesName={player.species.name}
                  spriteUrl={backSprite(player, spriteStyle)}
                  className={`h-48 w-48 object-contain [image-rendering:pixelated] drop-shadow-[0_12px_2px_rgba(0,0,0,.25)] ${spriteStyle === "3d" ? "scale-x-[-1]" : ""}`}
                />
              </div>
              <BattleStatus pokemon={player} className="absolute bottom-5 right-5 w-[min(350px,50%)]" />
            </>
          )}

          <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-black/20 bg-black/65 px-3 py-1 text-xs font-extrabold uppercase text-white shadow">
            Rodada {encounter.round_no} · {encounter.active_side === "player" ? "Seu turno" : encounter.active_side === "opponent" ? "Turno oponente" : "Preparação"}
          </div>
        </div>

        <div className="max-h-[48%] shrink-0 overflow-y-auto border-t border-white/10 bg-[#0b1110] p-3">
          <div className="mb-3 min-h-11 rounded-md border border-[#d8b85a]/30 bg-[#111b16] px-4 py-3 text-sm font-bold text-[#f6e8b4]">
            {busy && <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />}{battleMessage}
          </div>

          {pendingPlayerReaction && (
            <div className="mb-3 rounded-md border border-[#ffcb48]/45 bg-[#182019] p-3 shadow-lg">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-extrabold uppercase text-[#ffdf79]">Reagir ao ataque</p>
                  <p className="mt-1 text-xs text-white/75">
                    {pendingPlayerReaction.attackerName} conseguiu <strong className="text-white">{pendingPlayerReaction.attackSuccesses} sucesso(s)</strong> com {pendingPlayerReaction.moveName}.
                  </p>
                  <p className="mt-1 text-[11px] text-white/55">
                    Reação #{pendingPlayerReaction.actionNumber}: pool mínima {pendingPlayerReaction.minimumPool} ({pendingPlayerReaction.actionNumber} da ação + {pendingPlayerReaction.attackSuccesses} do ataque).
                  </p>
                </div>
                <span className="rounded bg-black/35 px-2 py-1 text-xs font-bold text-white/70">{pendingPlayerReaction.defenderName}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!pendingPlayerReaction.canClash}
                  onClick={() => answerPlayerReaction("clash")}
                  className="min-w-36"
                >
                  <Swords className="mr-1.5 h-4 w-4" /> Clash · {pendingPlayerReaction.clashPool}d6
                </Button>
                <Button
                  disabled={!pendingPlayerReaction.canEvade}
                  onClick={() => answerPlayerReaction("evade")}
                  className="min-w-36"
                >
                  <Shield className="mr-1.5 h-4 w-4" /> Evasion · {pendingPlayerReaction.evadePool}d6
                </Button>
                <Button variant="secondary" onClick={() => answerPlayerReaction("none")}>Não reagir</Button>
              </div>
              <p className="mt-2 text-[11px] text-white/55">Clash e Evasion contam como ações mesmo quando falham. A contagem zera quando o turno retorna ao Pokémon.</p>
            </div>
          )}

          {encounter.battle_phase === "choose_pokemon" && (
            <div>
              <p className="mb-2 text-sm font-extrabold uppercase text-white">Escolha seu Pokémon</p>
              <div className="grid max-h-44 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {team.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={busy || currentHp(entry) <= 0}
                    onClick={() => void choosePokemon(entry)}
                    className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 p-2 text-left transition hover:border-[#ffcb48]/60 hover:bg-[#ffcb48]/10 disabled:opacity-45"
                  >
                    <PokemonSpriteImage speciesName={entry.species.name} spriteUrl={frontSprite(entry, spriteStyle)} className="h-12 w-12 object-contain [image-rendering:pixelated]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{pokemonName(entry)}</span>
                      <span className="block text-xs text-muted-foreground">HP {currentHp(entry)}/{entry.hp}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {awaitingPlayerSwitch && player && (
            <div className="rounded-md border border-[#ffcb48]/45 bg-[#182019] p-3 shadow-lg">
              <div className="mb-3">
                <p className="text-sm font-extrabold uppercase text-[#ffdf79]">{pokemonName(player)} foi derrotado</p>
                <p className="mt-1 text-xs text-white/70">
                  {opponentController === "trainer_npc"
                    ? "Escolha outro Pokemon da equipe ou conceda a vitoria. Nao e possivel fugir de treinadores."
                    : "Escolha outro Pokemon da equipe ou tente fugir com Destreza + Athletic."}
                </p>
              </div>
              <div className="grid max-h-44 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {healthySwitchOptions.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void changePlayerPokemon(entry)}
                    className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 p-2 text-left transition hover:border-[#ffcb48]/60 hover:bg-[#ffcb48]/10 disabled:opacity-45"
                  >
                    <PokemonSpriteImage speciesName={entry.species.name} spriteUrl={frontSprite(entry, spriteStyle)} className="h-12 w-12 object-contain [image-rendering:pixelated]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{pokemonName(entry)}</span>
                      <span className="block text-xs text-muted-foreground">HP {currentHp(entry)}/{entry.hp}</span>
                    </span>
                  </button>
                ))}
              </div>
              {healthySwitchOptions.length === 0 && (
                <p className="mb-3 rounded-md border border-white/10 bg-black/20 px-3 py-4 text-center text-sm text-white/65">Nenhum outro PokÃ©mon da equipe pode lutar.</p>
              )}
              {opponentController === "trainer_npc" ? (
                <Button variant="destructive" disabled={busy} onClick={() => void concedeTrainerBattle()}>
                  <DoorOpen className="mr-1.5 h-4 w-4" /> Conceder vitoria
                </Button>
              ) : (
                <Button variant="destructive" disabled={busy || !trainerInventory} onClick={() => void fleeBattle()}>
                  <DoorOpen className="mr-1.5 h-4 w-4" /> Fugir
                </Button>
              )}
            </div>
          )}

          {encounter.battle_phase === "initiative" && player && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <p className="font-bold">Iniciativa do oponente: {encounter.opponent_initiative ?? 0}</p>
                <p className="text-xs text-muted-foreground">Role Destreza + Alert para entrar no Turn Order.</p>
              </div>
              <Button disabled={busy || encounter.player_initiative !== null} onClick={() => void rollPlayerInitiative()}>
                <Zap className="mr-2 h-4 w-4" /> Rolar iniciativa
              </Button>
            </div>
          )}

          {encounter.battle_phase === "active" && player && !awaitingPlayerSwitch && (
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={!playerCanAct} onClick={() => void quickAction("Evasion", battleAttr(player, "dexterity") + Number(player.skills?.Evasion ?? 0))}>
                <Shield className="mr-1.5 h-4 w-4" /> Evasion
              </Button>
              <Button disabled={!playerCanAct} onClick={() => void quickAction("Clash", battleAttr(player, "strength") + Number(player.skills?.Clash ?? 0))}>
                <Swords className="mr-1.5 h-4 w-4" /> Clash
              </Button>
              <Button disabled={!playerCanAct} onClick={() => void quickAction("Generic Roll", battleAttr(player, "dexterity"))}>
                <Dices className="mr-1.5 h-4 w-4" /> Generic Roll
              </Button>
              <Button disabled={!playerCanAct} onClick={() => setMovesOpen(true)}>
                <Sparkles className="mr-1.5 h-4 w-4" /> Moves
              </Button>
              <Button
                variant="secondary"
                disabled={!playerCanAct || healthySwitchOptions.length === 0}
                onClick={() => setSwitchOpen(true)}
              >
                <ArrowLeftRight className="mr-1.5 h-4 w-4" /> Trocar PokÃ©mon
              </Button>
              <Button variant="secondary" onClick={() => setDetailsOpen("abilities")}>
                Habilidades
              </Button>
              <Button variant="secondary" onClick={() => setDetailsOpen("status")}>
                Status
              </Button>
              <Button variant="secondary" onClick={() => setDetailsOpen("attrs")}>
                Atributos
              </Button>
              {battleUtilitiesUnlocked && (
                <>
                  <Button variant="secondary" disabled={opponentController === "trainer_npc"} onClick={() => setCaptureOpen(true)}>
                    <CircleDot className="mr-1.5 h-4 w-4" /> Capturar
                  </Button>
                  <Button variant="secondary" onClick={() => setItemsOpen(true)}>
                    <Backpack className="mr-1.5 h-4 w-4" /> Itens
                  </Button>
                </>
              )}
              {onOpenPokemon && (
                <Button variant="secondary" onClick={() => onOpenPokemon(player.id, pokemonName(player))}>Ficha</Button>
              )}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">Ações: {encounter.player_actions}</span>
                <Button variant="destructive" disabled={!playerCanPass} onClick={() => void switchToOpponent()}>
                  Passar turno
                </Button>
              </div>
            </div>
          )}

          {playerActionLocked && playerHasTurn && (
            <p className="mt-2 text-xs font-semibold text-[#ffcf68]">
              A última ação falhou. Este Pokémon não pode agir novamente até você passar o turno.
            </p>
          )}

          {finished && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-extrabold text-white">{encounter.status === "won" ? "Batalha vencida" : "Batalha encerrada"}</p>
                <p className="text-xs text-muted-foreground">O resultado e todas as rolagens ficaram registrados no chat.</p>
              </div>
              <Button onClick={() => void leaveFinishedBattle()}>Voltar à rota</Button>
            </div>
          )}
        </div>

        <Dialog open={switchOpen} onOpenChange={setSwitchOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Trocar PokÃ©mon</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">A troca encerra o turno atual. Escolha quem entrarÃ¡ na batalha.</p>
            <div className="grid max-h-[55vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {healthySwitchOptions.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void changePlayerPokemon(entry)}
                  className="flex items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition hover:border-primary/60 hover:bg-accent disabled:opacity-45"
                >
                  <PokemonSpriteImage speciesName={entry.species.name} spriteUrl={frontSprite(entry, spriteStyle)} className="h-14 w-14 object-contain [image-rendering:pixelated]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{pokemonName(entry)}</span>
                    <span className="block text-xs text-muted-foreground">HP {currentHp(entry)}/{entry.hp} Â· {entry.rank}</span>
                  </span>
                </button>
              ))}
              {healthySwitchOptions.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground sm:col-span-2">Nenhum outro PokÃ©mon da equipe pode lutar.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={movesOpen} onOpenChange={setMovesOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Moves de {pokemonName(player)}</DialogTitle></DialogHeader>
            <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
              {playerMoves.map((move) => {
                const stats = player ? computeMoveStats(move, withBattleAttributeBonuses(player), player.species.types ?? []) : null;
                return (
                  <button
                    key={move.id}
                    type="button"
                    disabled={!playerCanAct}
                    onClick={() => {
                      setMovesOpen(false);
                      setSelectedBattleMove(move);
                    }}
                    className="rounded-md border border-border bg-card p-3 text-left hover:border-primary/60 hover:bg-accent"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-bold">{move.name}</span>
                      <span className="text-xs uppercase text-muted-foreground">{move.type} · Poder {move.power}</span>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">Acurácia {stats?.accPool ?? 0}d6{stats?.isStatus ? "" : ` · Dano ${stats?.dmgPool ?? 0}d6 antes da defesa`}</span>
                    {move.effect && <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{move.effect}</span>}
                  </button>
                );
              })}
              {playerMoves.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Este Pokémon não possui moves.</p>}
            </div>
          </DialogContent>
        </Dialog>

        {selectedBattleMove && selectedBattleMoveStats && player && (
          <ClassicMoveRollDialog
            open
            move={selectedBattleMove}
            pokemonName={pokemonName(player)}
            accPool={selectedBattleMoveStats.accPool}
            dmgPool={selectedBattleMoveStats.dmgPool}
            isStatus={selectedBattleMoveStats.isStatus}
            hasStab={selectedBattleMoveStats.hasStab}
            accuracyText={selectedBattleMoveStats.accuracyText}
            damagePoolText={selectedBattleMoveStats.damagePoolText}
            painPenalty={painPenaltyFor(currentHp(player), player.hp)}
            imageUrl={frontSprite(player, spriteStyle)}
            initialActions={Number(encounter.player_actions ?? 0)}
            onOpenChange={(open) => !open && setSelectedBattleMove(null)}
            onConfirm={(options) => playerMove(selectedBattleMove, options)}
          />
        )}

        <Dialog open={!!detailsOpen} onOpenChange={(open) => !open && setDetailsOpen(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{detailsOpen === "abilities" ? "Habilidades" : detailsOpen === "status" ? "Status" : "Atributos"}</DialogTitle></DialogHeader>
            {detailsOpen === "abilities" && <div className="space-y-2">{(chosenDetails?.species.abilities ?? []).map((ability) => <div key={ability} className="rounded-md border p-3 font-bold">{ability}</div>)}</div>}
            {detailsOpen === "status" && <div className="flex flex-wrap gap-2">{(chosenDetails?.status ?? []).length ? chosenDetails?.status.map((status) => <span key={status} className="rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-sm font-bold">{status}</span>) : <p className="text-sm text-muted-foreground">Sem condições.</p>}</div>}
            {detailsOpen === "attrs" && chosenDetails && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries({ ...chosenDetails.species.base_attrs, ...chosenDetails.current_attrs }).map(([name]) => {
                  const baseValue = attr(chosenDetails, name);
                  const bonus = Number(attributeBonuses[chosenDetails.id]?.[name] ?? 0);
                  return (
                    <div key={name} className="rounded-md border p-3">
                      <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                        <span className="capitalize text-muted-foreground">{name}</span>
                        <strong className="tabular-nums">{baseValue + bonus}</strong>
                      </div>
                      <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        Bônus
                        <Input
                          type="number"
                          value={bonus}
                          onChange={(event) => {
                            const next = Number.parseInt(event.target.value || "0", 10) || 0;
                            setAttributeBonuses((current) => ({
                              ...current,
                              [chosenDetails.id]: { ...(current[chosenDetails.id] ?? {}), [name]: next },
                            }));
                          }}
                          className="h-8 w-20 text-center font-bold tabular-nums"
                        />
                      </label>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground sm:col-span-2">Estes bônus valem somente durante esta batalha e zeram ao encerrá-la.</p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={captureOpen} onOpenChange={setCaptureOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Capturar {pokemonName(wild)}</DialogTitle></DialogHeader>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p><strong>Necessário:</strong> {CAPTURE_SUCCESSES[String(wild.rank).toLowerCase() as Rank] ?? 4} sucessos</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Bônus garantidos acumulam: metade da vida, exatamente 1 HP e condição negativa.
              </p>
            </div>
            <div className="grid max-h-[45vh] gap-2 overflow-y-auto pr-1">
              {availableBalls.map(({ item, index, key }) => {
                const ball = CAPTURE_BALLS[key];
                return (
                  <Button
                    key={`${key}-${index}`}
                    variant="outline"
                    disabled={busy}
                    onClick={() => void capturePokemon(key, index)}
                    className="h-auto justify-between px-4 py-3"
                  >
                    <span className="flex items-center gap-2"><CircleDot className="h-4 w-4" /> {ball.label}</span>
                    <span className="text-xs text-muted-foreground">{item.qty}x · {key === "masterball" ? "captura imediata" : `${ball.pool}d6`}</span>
                  </Button>
                );
              })}
              {availableBalls.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma Poké Ball disponível na mochila.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={itemsOpen} onOpenChange={setItemsOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Usar item em {pokemonName(player)}</DialogTitle></DialogHeader>
            <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1">
              {usableBattleItems.map((item) => (
                <Button
                  key={`${item.source}-${item.stockKey ?? item.index}-${item.name}`}
                  variant="outline"
                  disabled={busy || !item.supported}
                  onClick={() => void useBattleItem(item)}
                  className="h-auto min-h-14 justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{item.name}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {item.supported ? (item.desc || "Aplicar durante a batalha") : "Efeito ainda não automatizado"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.qty}x</span>
                </Button>
              ))}
              {usableBattleItems.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">A mochila não possui itens disponíveis.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <div
          role="separator"
          aria-label="Redimensionar janela de batalha"
          onPointerDown={startWindowResize}
          className="absolute bottom-0 right-0 z-[60] flex h-8 w-8 touch-none cursor-nwse-resize select-none items-end justify-end rounded-tl-md bg-black/35 p-1 text-[#d8b85a] transition-colors hover:bg-black/60 hover:text-[#ffe38b]"
        >
          <MoveDiagonal2 className="h-4 w-4" />
        </div>
      </ClassicBattleDialogContent>
    </Dialog>
  );
}

function BattleStatus({ pokemon, className }: { pokemon: BattlePokemon; className?: string }) {
  const hp = currentHp(pokemon);
  const max = Math.max(1, pokemon.hp);
  const percent = Math.max(0, Math.min(100, (hp / max) * 100));
  return (
    <div className={`z-10 rounded-md border-2 border-[#46503d] bg-[#f3f0d1]/95 p-3 text-[#253022] shadow-[4px_4px_0_rgba(0,0,0,.25)] ${className ?? ""}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate font-black">{pokemonName(pokemon)}</span>
        <span className="text-xs font-extrabold uppercase">{pokemon.rank}</span>
      </div>
      <div className="flex items-center gap-2 text-xs font-bold">
        <Heart className="h-3.5 w-3.5 text-[#d44838]" />
        <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-[#46503d] bg-[#d9d2a9]">
          <div className={`h-full transition-all ${percent > 50 ? "bg-[#4fb45a]" : percent > 20 ? "bg-[#e8b740]" : "bg-[#d94a3e]"}`} style={{ width: `${percent}%` }} />
        </div>
        <span>{hp}/{pokemon.hp}</span>
      </div>
      {(pokemon.status ?? []).length > 0 && (
        <div className="mt-1 flex items-center gap-1 text-[10px] font-extrabold uppercase text-[#8b352d]">
          <Activity className="h-3 w-3" /> {pokemon.status.join(", ")}
        </div>
      )}
    </div>
  );
}
