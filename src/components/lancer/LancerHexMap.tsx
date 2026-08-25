import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  Clock3,
  Crosshair,
  Dices,
  Eye,
  Footprints,
  Hand,
  MapPin,
  MousePointer2,
  Mountain,
  Plus,
  Ruler,
  Shield,
  Swords,
  Trees,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  analyzeHexLineOfSight,
  axialToPixel,
  findHexPath,
  hasHexLineOfSight,
  hexDistance,
  hexKey,
  isHexInBounds,
  pixelToAxial,
  reachableHexes,
  type HexCoord,
  type LancerHexCell,
  type LancerHexTerrainType,
} from "@/lib/lancer/hex-engine";
import { resolveLancerAttack, spendLancerAction } from "@/lib/lancer/combat-engine";
import { applyLancerEffects, prepareLancerActionUse, type LancerFrequencyContext } from "@/lib/lancer/advanced-combat-engine";
import type {
  LancerCombatParticipant,
  LancerCombatSession,
  LancerCompendiumItem,
  LancerEntity,
  LancerGameActionDefinition,
  LancerGameEvent,
  LancerHexMap,
  LancerMapHex,
  LancerMapToken,
  LancerPendingCombatEffect,
  LancerResourceState,
} from "@/lib/lancer/types";

type RpcResult<T> = { data: T | null; error: { message: string; code?: string } | null };
type MapMode = "select" | "move" | "pan" | "measure" | "terrain";

type Props = {
  gameId: string;
  userId: string;
  isNarrator: boolean;
  entities: LancerEntity[];
  items: LancerCompendiumItem[];
  autoApplyDamage: boolean;
  onOpenEntity: (entityId: string) => void;
};

type Camera = { x: number; y: number; zoom: number };
type CanvasSize = { width: number; height: number };
type PointerDrag = { pointerId: number; x: number; y: number; camera: Camera; moved: boolean };

const TERRAIN_CONFIG: Record<LancerHexTerrainType, {
  label: string;
  fill: string;
  stroke: string;
  movementCost: number;
  blocksMovement: boolean;
  blocksLos: boolean;
  cover: 0 | 1 | 2;
}> = {
  normal: { label: "Normal", fill: "rgba(17, 30, 40, .64)", stroke: "rgba(86, 116, 132, .32)", movementCost: 1, blocksMovement: false, blocksLos: false, cover: 0 },
  difficult: { label: "Difícil", fill: "rgba(202, 138, 4, .25)", stroke: "rgba(250, 204, 21, .65)", movementCost: 2, blocksMovement: false, blocksLos: false, cover: 0 },
  dangerous: { label: "Perigoso", fill: "rgba(220, 38, 38, .24)", stroke: "rgba(248, 113, 113, .65)", movementCost: 1, blocksMovement: false, blocksLos: false, cover: 0 },
  obstruction: { label: "Obstrução", fill: "rgba(51, 65, 85, .88)", stroke: "rgba(148, 163, 184, .85)", movementCost: 1, blocksMovement: true, blocksLos: true, cover: 2 },
  cover: { label: "Cobertura", fill: "rgba(6, 148, 162, .24)", stroke: "rgba(34, 211, 238, .65)", movementCost: 1, blocksMovement: false, blocksLos: false, cover: 1 },
  custom: { label: "Custom", fill: "rgba(147, 51, 234, .2)", stroke: "rgba(192, 132, 252, .65)", movementCost: 1, blocksMovement: false, blocksLos: false, cover: 0 },
};

const MODE_CONFIG: Record<MapMode, { label: string; icon: typeof MousePointer2 }> = {
  select: { label: "Selecionar", icon: MousePointer2 },
  move: { label: "Mover", icon: Footprints },
  pan: { label: "Navegar", icon: Hand },
  measure: { label: "Medir", icon: Ruler },
  terrain: { label: "Terreno", icon: Mountain },
};

function mapHexToEngineCell(hex: LancerMapHex): LancerHexCell {
  return {
    q: hex.q,
    r: hex.r,
    terrainType: hex.terrain_type,
    movementCost: hex.movement_cost,
    blocksMovement: hex.blocks_movement,
    blocksLos: hex.blocks_los,
    cover: hex.cover,
  };
}

function displayName(entity: LancerEntity): string {
  return entity.callsign || entity.name;
}

function entityColor(entity: LancerEntity): string {
  if (entity.entity_type === "mech") return "#22d3ee";
  if (entity.entity_type === "pilot") return "#fbbf24";
  if (entity.entity_type === "npc") return "#fb7185";
  if (entity.entity_type === "deployable") return "#a78bfa";
  return "#94a3b8";
}

function entityInitials(entity: LancerEntity): string {
  return displayName(entity)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function hexPath(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  context.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = Math.PI / 180 * (60 * index + 30);
    const px = x + size * Math.cos(angle);
    const py = y + size * Math.sin(angle);
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

function resourceEntries(entity: LancerEntity): [string, LancerResourceState][] {
  return Object.entries(entity.current_state.resources).filter(
    (entry): entry is [string, LancerResourceState] => !!entry[1],
  );
}

export function LancerHexMap({ gameId, userId, isNarrator, entities, items, autoApplyDamage, onOpenEntity }: Props) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<PointerDrag | null>(null);
  const centeredMapRef = useRef<string | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 900, height: 640 });
  const [camera, setCamera] = useState<Camera>({ x: 120, y: 90, zoom: 1 });
  const [mode, setMode] = useState<MapMode>("select");
  const [terrain, setTerrain] = useState<LancerHexTerrainType>("difficult");
  const [hoveredHex, setHoveredHex] = useState<HexCoord | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [placingEntityId, setPlacingEntityId] = useState<string>("");
  const [measureOrigin, setMeasureOrigin] = useState<HexCoord | null>(null);
  const [pendingAction, setPendingAction] = useState<{ action: LancerGameActionDefinition; sourceTokenId: string; sourceCompendiumItemId: string | null } | null>(null);
  const [attackTargetTokenId, setAttackTargetTokenId] = useState<string | null>(null);
  const [attackAccuracy, setAttackAccuracy] = useState(0);
  const [attackDifficulty, setAttackDifficulty] = useState(0);

  const mapQuery = useQuery({
    queryKey: ["lancer-maps", gameId],
    queryFn: async () => {
      const query = supabase.from("lancer_maps" as never) as never as {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: boolean) => {
              maybeSingle: () => Promise<RpcResult<LancerHexMap>>;
            };
          };
        };
      };
      const { data, error } = await query.select("*").eq("game_id", gameId).eq("is_active", true).maybeSingle();
      if (error) throw error;
      return data;
    },
    retry: false,
  });
  const map = mapQuery.data ?? null;

  const hexesQuery = useQuery({
    queryKey: ["lancer-map-hexes", map?.id],
    enabled: !!map,
    queryFn: async () => {
      const query = supabase.from("lancer_map_hexes" as never) as never as {
        select: (columns: string) => {
          eq: (column: string, value: string) => Promise<RpcResult<LancerMapHex[]>>;
        };
      };
      const { data, error } = await query.select("*").eq("map_id", map!.id);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const tokensQuery = useQuery({
    queryKey: ["lancer-map-tokens", map?.id],
    enabled: !!map,
    queryFn: async () => {
      const query = supabase.from("lancer_map_tokens" as never) as never as {
        select: (columns: string) => {
          eq: (column: string, value: string) => Promise<RpcResult<LancerMapToken[]>>;
        };
      };
      const { data, error } = await query.select("*").eq("map_id", map!.id);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const combatQuery = useQuery({
    queryKey: ["lancer-combat-session", gameId],
    queryFn: async () => {
      const query = supabase.from("lancer_combat_sessions" as never) as never as {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => {
              maybeSingle: () => Promise<RpcResult<LancerCombatSession>>;
            };
          };
        };
      };
      const { data, error } = await query.select("*").eq("game_id", gameId).eq("status", "active").maybeSingle();
      if (error) throw error;
      return data;
    },
    retry: false,
  });
  const combat = combatQuery.data ?? null;

  const participantsQuery = useQuery({
    queryKey: ["lancer-combat-participants", combat?.id],
    enabled: !!combat,
    queryFn: async () => {
      const query = supabase.from("lancer_combat_participants" as never) as never as {
        select: (columns: string) => {
          eq: (column: string, value: string) => Promise<RpcResult<LancerCombatParticipant[]>>;
        };
      };
      const { data, error } = await query.select("*").eq("session_id", combat!.id);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const attackCardsQuery = useQuery({
    queryKey: ["lancer-attack-cards", gameId],
    queryFn: async () => {
      const query = supabase.from("lancer_game_events" as never) as never as {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => {
              order: (column: string, options: { ascending: boolean }) => {
                limit: (count: number) => Promise<RpcResult<LancerGameEvent[]>>;
              };
            };
          };
        };
      };
      const { data, error } = await query.select("*").eq("game_id", gameId).eq("event_type", "attack_card").order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const pendingEffectsQuery = useQuery({
    queryKey: ["lancer-pending-combat-effects", gameId],
    enabled: !!combat,
    queryFn: async () => {
      const query = supabase.from("lancer_pending_combat_effects" as never) as never as {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => {
              order: (column: string, options: { ascending: boolean }) => Promise<RpcResult<LancerPendingCombatEffect[]>>;
            };
          };
        };
      };
      const { data, error } = await query.select("*").eq("game_id", gameId).eq("status", "pending").order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const tokens = tokensQuery.data ?? [];
  const participants = participantsQuery.data ?? [];
  const hexes = hexesQuery.data ?? [];
  const entityById = useMemo(() => new Map(entities.map((entity) => [entity.id, entity])), [entities]);
  const tokenById = useMemo(() => new Map(tokens.map((token) => [token.id, token])), [tokens]);
  const tokenByHex = useMemo(() => new Map(tokens.map((token) => [hexKey(token), token])), [tokens]);
  const cells = useMemo(() => new Map(hexes.map((hex) => [hexKey(hex), mapHexToEngineCell(hex)])), [hexes]);
  const occupied = useMemo(() => new Set(tokens.map((token) => hexKey(token))), [tokens]);
  const selectedToken = selectedTokenId ? tokenById.get(selectedTokenId) ?? null : null;
  const selectedEntity = selectedToken ? entityById.get(selectedToken.entity_id) ?? null : null;
  const activeParticipant = combat?.active_participant_id
    ? participants.find((participant) => participant.id === combat.active_participant_id) ?? null
    : null;
  const activeEntity = activeParticipant ? entityById.get(activeParticipant.entity_id) ?? null : null;
  const activeToken = activeParticipant?.token_id ? tokenById.get(activeParticipant.token_id) ?? null : null;
  const actionCatalog = useMemo(() => new Map(
    items.flatMap((item) => item.action_definitions).map((action) => [action.id, action]),
  ), [items]);
  const actionSourceItemId = useMemo(() => new Map(
    items.flatMap((item) => item.action_definitions.map((action) => [action.id, item.id] as const)),
  ), [items]);
  const activeActions = useMemo(() => {
    if (!activeEntity) return [];
    return activeEntity.current_state.actionIds
      .map((actionId) => actionCatalog.get(actionId))
      .filter((action): action is LancerGameActionDefinition => !!action);
  }, [actionCatalog, activeEntity]);
  const frequencyContext = useMemo<LancerFrequencyContext>(() => ({
    turnId: `${combat?.id ?? gameId}:${combat?.round ?? 0}:${activeParticipant?.id ?? "none"}`,
    roundId: `${combat?.id ?? gameId}:${combat?.round ?? 0}`,
    sceneId: combat?.id ?? gameId,
    missionId: gameId,
  }), [activeParticipant?.id, combat?.id, combat?.round, gameId]);
  const actionAvailability = useMemo(() => new Map(activeActions.map((action) => [
    action.id,
    activeEntity ? prepareLancerActionUse({
      state: activeEntity.current_state,
      action,
      frequencyContext,
      compendiumItemId: actionSourceItemId.get(action.id) ?? null,
    }) : null,
  ])), [actionSourceItemId, activeActions, activeEntity, frequencyContext]);
  const bounds = map ? { qMin: map.q_min, qMax: map.q_max, rMin: map.r_min, rMax: map.r_max } : undefined;
  const selectedSpeed = Math.max(0, Number(selectedEntity?.current_state.stats.speed ?? 0));
  const reachable = useMemo(() => {
    if (!selectedToken || mode !== "move" || !bounds) return null;
    const tokenOccupied = new Set(occupied);
    tokenOccupied.delete(hexKey(selectedToken));
    return reachableHexes(selectedToken, selectedSpeed, { bounds, cells, occupied: tokenOccupied });
  }, [bounds, cells, mode, occupied, selectedSpeed, selectedToken]);
  const hoverPath = useMemo(() => {
    if (!selectedToken || !hoveredHex || mode !== "move" || !bounds) return null;
    const tokenOccupied = new Set(occupied);
    tokenOccupied.delete(hexKey(selectedToken));
    return findHexPath(selectedToken, hoveredHex, {
      bounds,
      cells,
      occupied: tokenOccupied,
      maximumCost: selectedSpeed,
    });
  }, [bounds, cells, hoveredHex, mode, occupied, selectedSpeed, selectedToken]);
  const measure = useMemo(() => {
    if (!measureOrigin || !hoveredHex) return null;
    return {
      distance: hexDistance(measureOrigin, hoveredHex),
      los: hasHexLineOfSight(measureOrigin, hoveredHex, cells),
    };
  }, [cells, hoveredHex, measureOrigin]);
  const unplacedEntities = useMemo(() => {
    const placed = new Set(tokens.map((token) => token.entity_id));
    return entities.filter((entity) => !placed.has(entity.id));
  }, [entities, tokens]);
  const pendingSourceToken = pendingAction ? tokenById.get(pendingAction.sourceTokenId) ?? null : null;
  const pendingSourceEntity = pendingSourceToken ? entityById.get(pendingSourceToken.entity_id) ?? null : null;
  const attackTargetToken = attackTargetTokenId ? tokenById.get(attackTargetTokenId) ?? null : null;
  const attackTargetEntity = attackTargetToken ? entityById.get(attackTargetToken.entity_id) ?? null : null;
  const targetPreview = useMemo(() => {
    if (!pendingAction || !pendingSourceToken || !attackTargetToken) return null;
    const distance = hexDistance(pendingSourceToken, attackTargetToken);
    const range = Math.max(0, ...pendingAction.action.range.map((entry) => Number(entry.value) || 0));
    const lineOfSight = analyzeHexLineOfSight(pendingSourceToken, attackTargetToken, cells);
    return {
      distance,
      range,
      inRange: range === 0 || distance <= range,
      hasLos: lineOfSight.hasLineOfSight,
      cover: lineOfSight.cover,
      coverDifficulty: pendingAction.action.attackType === "tech" ? 0 : lineOfSight.difficulty,
    };
  }, [attackTargetToken, cells, pendingAction, pendingSourceToken]);
  const validTargetTokenIds = useMemo(() => {
    const result = new Set<string>();
    if (!pendingAction || !pendingSourceToken) return result;
    const maximumRange = Math.max(0, ...pendingAction.action.range.map((entry) => Number(entry.value) || 0));
    for (const token of tokens) {
      if (token.id === pendingSourceToken.id) continue;
      const inRange = maximumRange === 0 || hexDistance(pendingSourceToken, token) <= maximumRange;
      if (inRange && analyzeHexLineOfSight(pendingSourceToken, token, cells).hasLineOfSight) result.add(token.id);
    }
    return result;
  }, [cells, pendingAction, pendingSourceToken, tokens]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setCanvasSize({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(420, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!map || centeredMapRef.current === map.id) return;
    const center = axialToPixel({
      q: (map.q_min + map.q_max) / 2,
      r: (map.r_min + map.r_max) / 2,
    }, map.hex_size);
    setCamera({ x: canvasSize.width / 2 - center.x, y: canvasSize.height / 2 - center.y, zoom: 0.85 });
    centeredMapRef.current = map.id;
  }, [canvasSize.height, canvasSize.width, map]);

  useEffect(() => {
    if (!map) return;
    const channel = supabase
      .channel(`lancer-map:${map.id}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lancer_map_hexes", filter: `map_id=eq.${map.id}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["lancer-map-hexes", map.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "lancer_map_tokens", filter: `map_id=eq.${map.id}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["lancer-map-tokens", map.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "lancer_combat_sessions", filter: `game_id=eq.${gameId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["lancer-combat-session", gameId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "lancer_combat_participants" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["lancer-combat-participants", combat?.id] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lancer_game_events", filter: `game_id=eq.${gameId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["lancer-attack-cards", gameId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "lancer_pending_combat_effects", filter: `game_id=eq.${gameId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["lancer-pending-combat-effects", gameId] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [combat?.id, gameId, map, queryClient]);

  const placeToken = useMutation({
    mutationFn: async ({ entityId, coord }: { entityId: string; coord: HexCoord }) => {
      const { data, error } = await (supabase.rpc("place_lancer_token" as never, {
        p_map_id: map!.id,
        p_entity_id: entityId,
        p_q: coord.q,
        p_r: coord.r,
      } as never) as unknown as Promise<RpcResult<LancerMapToken>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      setPlacingEntityId("");
      void queryClient.invalidateQueries({ queryKey: ["lancer-map-tokens", map?.id] });
      toast.success("Entidade posicionada no mapa.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const moveToken = useMutation({
    mutationFn: async ({ token, path }: { token: LancerMapToken; path: HexCoord[] }) => {
      const destination = path.at(-1)!;
      const { data, error } = await (supabase.rpc("move_lancer_token" as never, {
        p_token_id: token.id,
        p_expected_revision: token.revision,
        p_q: destination.q,
        p_r: destination.r,
        p_path: path,
        p_force: false,
      } as never) as unknown as Promise<RpcResult<LancerMapToken>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lancer-map-tokens", map?.id] });
      void queryClient.invalidateQueries({ queryKey: ["lancer-events", gameId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const paintHex = useMutation({
    mutationFn: async (coord: HexCoord) => {
      const config = TERRAIN_CONFIG[terrain];
      const { data, error } = await (supabase.rpc("paint_lancer_hex" as never, {
        p_map_id: map!.id,
        p_q: coord.q,
        p_r: coord.r,
        p_terrain_type: terrain,
        p_movement_cost: config.movementCost,
        p_blocks_movement: config.blocksMovement,
        p_blocks_los: config.blocksLos,
        p_cover: config.cover,
      } as never) as unknown as Promise<RpcResult<LancerMapHex>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["lancer-map-hexes", map?.id] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const startCombat = useMutation({
    mutationFn: async () => {
      const entityIds = tokens
        .map((token) => entityById.get(token.entity_id))
        .filter((entity): entity is LancerEntity => !!entity && entity.entity_type !== "object" && entity.entity_type !== "deployable")
        .map((entity) => entity.id);
      if (entityIds.length === 0) throw new Error("Posicione pelo menos um piloto, mech ou NPC no mapa.");
      const { data, error } = await (supabase.rpc("start_lancer_combat" as never, {
        p_game_id: gameId,
        p_map_id: map!.id,
        p_entity_ids: entityIds,
      } as never) as unknown as Promise<RpcResult<LancerCombatSession>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lancer-combat-session", gameId] });
      void queryClient.invalidateQueries({ queryKey: ["lancer-events", gameId] });
      toast.success("Combate iniciado.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activateParticipant = useMutation({
    mutationFn: async (participant: LancerCombatParticipant) => {
      const { data, error } = await (supabase.rpc("activate_lancer_participant" as never, {
        p_participant_id: participant.id,
      } as never) as unknown as Promise<RpcResult<LancerCombatSession>>);
      if (error) throw new Error(error.message);
      return { session: data, participant };
    },
    onSuccess: ({ participant }) => {
      setSelectedTokenId(participant.token_id);
      void queryClient.invalidateQueries({ queryKey: ["lancer-combat-session", gameId] });
      void queryClient.invalidateQueries({ queryKey: ["lancer-combat-participants", combat?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const endTurn = useMutation({
    mutationFn: async (participant: LancerCombatParticipant) => {
      const { data, error } = await (supabase.rpc("end_lancer_turn" as never, {
        p_participant_id: participant.id,
      } as never) as unknown as Promise<RpcResult<LancerCombatSession>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      setPendingAction(null);
      setAttackTargetTokenId(null);
      void queryClient.invalidateQueries({ queryKey: ["lancer-combat-session", gameId] });
      void queryClient.invalidateQueries({ queryKey: ["lancer-combat-participants", combat?.id] });
      void queryClient.invalidateQueries({ queryKey: ["lancer-events", gameId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const endCombat = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc("end_lancer_combat" as never, {
        p_session_id: combat!.id,
      } as never) as unknown as Promise<RpcResult<LancerCombatSession>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      setPendingAction(null);
      setAttackTargetTokenId(null);
      void queryClient.invalidateQueries({ queryKey: ["lancer-combat-session", gameId] });
      toast.success("Combate encerrado.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const commitAttack = useMutation({
    mutationFn: async () => {
      if (!combat || !activeParticipant || !pendingAction || !pendingSourceEntity || !pendingSourceToken || !attackTargetEntity || !attackTargetToken || !targetPreview) {
        throw new Error("A prévia do ataque está incompleta.");
      }
      if (!targetPreview.inRange) throw new Error("O alvo está fora do alcance.");
      if (!targetPreview.hasLos) throw new Error("O alvo não possui linha de visão válida.");
      const economy = spendLancerAction(activeParticipant.action_economy, pendingAction.action);
      if (!economy.allowed) throw new Error(economy.reason ?? "Ação indisponível.");
      const resolution = resolveLancerAttack({
        action: pendingAction.action,
        source: pendingSourceEntity.current_state,
        target: attackTargetEntity.current_state,
        sourceEntityId: pendingSourceEntity.id,
        targetEntityId: attackTargetEntity.id,
        sourceName: displayName(pendingSourceEntity),
        targetName: displayName(attackTargetEntity),
        distance: targetPreview.distance,
        hasLineOfSight: targetPreview.hasLos,
        accuracy: attackAccuracy,
        difficulty: attackDifficulty + targetPreview.coverDifficulty,
        sourceCompendiumItemId: pendingAction.sourceCompendiumItemId,
        frequencyContext,
      });
      const attackPayload = {
        ...resolution.result,
        sourceNextState: undefined,
        targetNextState: undefined,
        breakdown: resolution.breakdown,
      };
      const { data, error } = await (supabase.rpc("commit_lancer_attack" as never, {
        p_session_id: combat.id,
        p_source_entity_id: pendingSourceEntity.id,
        p_target_entity_id: attackTargetEntity.id,
        p_source_expected_revision: pendingSourceEntity.revision,
        p_target_expected_revision: attackTargetEntity.revision,
        p_action_id: pendingAction.action.id,
        p_resolution: attackPayload,
        p_source_next_state: resolution.result.sourceNextState,
        p_target_next_state: resolution.result.targetNextState,
        p_next_action_economy: economy.next,
        p_apply_damage: autoApplyDamage,
      } as never) as unknown as Promise<RpcResult<LancerEntity>>);
      if (error) throw new Error(error.message);
      return { data, result: resolution.result };
    },
    onSuccess: ({ result }) => {
      setPendingAction(null);
      setAttackTargetTokenId(null);
      setAttackAccuracy(0);
      setAttackDifficulty(0);
      void queryClient.invalidateQueries({ queryKey: ["lancer-entities", gameId] });
      void queryClient.invalidateQueries({ queryKey: ["lancer-combat-participants", combat?.id] });
      void queryClient.invalidateQueries({ queryKey: ["lancer-attack-cards", gameId] });
      void queryClient.invalidateQueries({ queryKey: ["lancer-events", gameId] });
      toast.success(result.outcome === "miss" ? "Ataque errou." : result.outcome === "critical" ? "Acerto crítico." : "Ataque acertou.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resolvePendingEffect = useMutation({
    mutationFn: async ({ pending, apply }: { pending: LancerPendingCombatEffect; apply: boolean }) => {
      const target = entityById.get(pending.target_entity_id);
      if (!target) throw new Error("A entidade alvo não está mais disponível.");
      let nextState = pending.proposed_state;
      if (apply && pending.effect_kind === "optional_effect") {
        const rawEffects = Array.isArray(pending.payload.effects)
          ? pending.payload.effects.filter((effect): effect is Record<string, unknown> => !!effect && typeof effect === "object" && !Array.isArray(effect))
          : [];
        nextState = applyLancerEffects(target.current_state, rawEffects, String(pending.payload.actionId ?? "optional-effect")).nextState;
      }
      const { data, error } = await (supabase.rpc("resolve_lancer_pending_combat_effect" as never, {
        p_pending_id: pending.id,
        p_apply: apply,
        p_expected_revision: target.revision,
        p_next_state: apply ? nextState : null,
      } as never) as unknown as Promise<RpcResult<LancerPendingCombatEffect>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lancer-pending-combat-effects", gameId] });
      void queryClient.invalidateQueries({ queryKey: ["lancer-entities", gameId] });
      void queryClient.invalidateQueries({ queryKey: ["lancer-events", gameId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const screenToHex = useCallback((clientX: number, clientY: number): HexCoord | null => {
    const canvas = canvasRef.current;
    if (!canvas || !map || !bounds) return null;
    const rect = canvas.getBoundingClientRect();
    const pixel = {
      x: (clientX - rect.left - camera.x) / camera.zoom,
      y: (clientY - rect.top - camera.y) / camera.zoom,
    };
    const coord = pixelToAxial(pixel, map.hex_size);
    return isHexInBounds(coord, bounds) ? coord : null;
  }, [bounds, camera, map]);

  const handleMapClick = useCallback((coord: HexCoord) => {
    const token = tokenByHex.get(hexKey(coord));
    if (placingEntityId) {
      if (token) return void toast.error("Esse hex já está ocupado.");
      placeToken.mutate({ entityId: placingEntityId, coord });
      return;
    }
    if (pendingAction && token && token.id !== pendingAction.sourceTokenId) {
      if (!validTargetTokenIds.has(token.id)) return void toast.error("Esse token não é um alvo válido por alcance ou linha de visão.");
      setAttackTargetTokenId(token.id);
      return;
    }
    if (mode === "terrain" && isNarrator) {
      paintHex.mutate(coord);
      return;
    }
    if (mode === "measure") {
      setMeasureOrigin((current) => current ? null : coord);
      return;
    }
    if (token) {
      setSelectedTokenId(token.id);
      if (mode === "select") return;
    }
    if (mode === "move" && selectedToken && hoverPath && hoverPath.path.length > 1) {
      moveToken.mutate({ token: selectedToken, path: hoverPath.path });
      return;
    }
    if (!token && mode === "select") setSelectedTokenId(null);
  }, [hoverPath, isNarrator, mode, moveToken, paintHex, pendingAction, placeToken, placingEntityId, selectedToken, tokenByHex, validTargetTokenIds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvasSize.width * ratio);
    canvas.height = Math.floor(canvasSize.height * ratio);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);
    context.fillStyle = "#080d12";
    context.fillRect(0, 0, canvasSize.width, canvasSize.height);
    context.save();
    context.translate(camera.x, camera.y);
    context.scale(camera.zoom, camera.zoom);

    for (let r = map.r_min; r <= map.r_max; r += 1) {
      for (let q = map.q_min; q <= map.q_max; q += 1) {
        const coord = { q, r };
        const center = axialToPixel(coord, map.hex_size);
        const cell = cells.get(hexKey(coord));
        const config = TERRAIN_CONFIG[cell?.terrainType ?? "normal"];
        hexPath(context, center.x, center.y, map.hex_size - 1);
        context.fillStyle = config.fill;
        context.fill();
        context.lineWidth = 1 / camera.zoom;
        context.strokeStyle = config.stroke;
        context.stroke();

        if (reachable?.costs.has(hexKey(coord)) && !hexEqualsToken(coord, selectedToken)) {
          hexPath(context, center.x, center.y, map.hex_size - 3);
          context.fillStyle = "rgba(34, 211, 238, .09)";
          context.fill();
        }
        if (cell?.terrainType === "dangerous") {
          context.fillStyle = "rgba(254, 202, 202, .7)";
          context.font = `${Math.max(9, map.hex_size * .28)}px sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText("!", center.x, center.y);
        }
      }
    }

    if (hoverPath) {
      for (const [index, coord] of hoverPath.path.entries()) {
        if (index === 0) continue;
        const center = axialToPixel(coord, map.hex_size);
        hexPath(context, center.x, center.y, map.hex_size - 4);
        context.fillStyle = "rgba(250, 204, 21, .24)";
        context.fill();
        context.strokeStyle = "rgba(250, 204, 21, .9)";
        context.lineWidth = 2 / camera.zoom;
        context.stroke();
      }
    }

    if (mode === "measure" && measureOrigin && hoveredHex) {
      const from = axialToPixel(measureOrigin, map.hex_size);
      const to = axialToPixel(hoveredHex, map.hex_size);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.setLineDash([8 / camera.zoom, 6 / camera.zoom]);
      context.strokeStyle = measure?.los ? "#22d3ee" : "#fb7185";
      context.lineWidth = 2 / camera.zoom;
      context.stroke();
      context.setLineDash([]);
    }

    if (pendingAction) {
      for (const token of tokens) {
        if (token.id === pendingAction.sourceTokenId) continue;
        const center = axialToPixel(token, map.hex_size);
        hexPath(context, center.x, center.y, map.hex_size - 2);
        context.fillStyle = validTargetTokenIds.has(token.id) ? "rgba(251, 113, 133, .16)" : "rgba(71, 85, 105, .22)";
        context.fill();
        context.strokeStyle = validTargetTokenIds.has(token.id) ? "rgba(251, 113, 133, .95)" : "rgba(100, 116, 139, .45)";
        context.lineWidth = 2 / camera.zoom;
        context.stroke();
      }
    }

    for (const token of tokens) {
      if (token.hidden && !isNarrator) continue;
      const entity = entityById.get(token.entity_id);
      if (!entity) continue;
      const center = axialToPixel(token, map.hex_size);
      const selected = token.id === selectedTokenId;
      context.save();
      context.shadowColor = selected ? "rgba(250, 204, 21, .8)" : "rgba(0, 0, 0, .7)";
      context.shadowBlur = selected ? 18 / camera.zoom : 8 / camera.zoom;
      context.beginPath();
      context.arc(center.x, center.y, map.hex_size * .58, 0, Math.PI * 2);
      context.fillStyle = "rgba(5, 10, 15, .94)";
      context.fill();
      context.lineWidth = (selected ? 4 : 2) / camera.zoom;
      context.strokeStyle = selected ? "#facc15" : entityColor(entity);
      context.stroke();
      context.restore();
      context.fillStyle = entityColor(entity);
      context.font = `900 ${Math.max(11, map.hex_size * .34)}px ui-monospace, monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(entityInitials(entity), center.x, center.y);
      context.font = `700 ${Math.max(8, map.hex_size * .2)}px sans-serif`;
      context.fillStyle = "#e2e8f0";
      context.fillText(displayName(entity).slice(0, 16), center.x, center.y + map.hex_size * .82);
    }

    if (hoveredHex) {
      const center = axialToPixel(hoveredHex, map.hex_size);
      hexPath(context, center.x, center.y, map.hex_size - 2);
      context.strokeStyle = placingEntityId ? "#facc15" : "rgba(226, 232, 240, .9)";
      context.lineWidth = 2 / camera.zoom;
      context.stroke();
    }
    context.restore();
  }, [camera, canvasSize, cells, entityById, hoveredHex, hoverPath, isNarrator, map, measure, measureOrigin, mode, pendingAction, placingEntityId, reachable, selectedToken, selectedTokenId, tokens, validTargetTokenIds]);

  const error = mapQuery.error || hexesQuery.error || tokensQuery.error;
  const combatError = combatQuery.error || participantsQuery.error || attackCardsQuery.error || pendingEffectsQuery.error;
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="flex h-full items-center justify-center bg-[#080d12] p-6">
        <div className="max-w-xl border-l-2 border-destructive bg-destructive/10 p-5">
          <div className="flex items-center gap-2 font-black uppercase text-destructive"><Shield className="h-4 w-4" /> Mapa LANCER indisponível</div>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          <p className="mt-2 text-xs text-muted-foreground">Aplique a migration da Fase 4 no Supabase para ativar mapas hexagonais.</p>
        </div>
      </div>
    );
  }

  if (!map) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Preparando mapa da operação...</div>;
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[#080d12]">
      <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-border bg-[#0d141c] px-3 py-2">
        <div className="mr-2 min-w-36">
          <div className="text-[9px] font-black uppercase text-cyan-300">Hex Map Engine</div>
          <div className="truncate text-sm font-black uppercase">{map.name}</div>
        </div>
        {(Object.keys(MODE_CONFIG) as MapMode[]).filter((value) => value !== "terrain" || isNarrator).map((value) => {
          const Icon = MODE_CONFIG[value].icon;
          return (
            <Button
              key={value}
              type="button"
              size="icon"
              variant={mode === value ? "default" : "outline"}
              className="h-9 w-9 rounded-md"
              title={MODE_CONFIG[value].label}
              onClick={() => {
                setMode(value);
                if (value !== "measure") setMeasureOrigin(null);
              }}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
        <div className="mx-1 h-7 w-px bg-border" />
        <Button type="button" size="icon" variant="outline" className="h-9 w-9" title="Afastar" onClick={() => setCamera((value) => ({ ...value, zoom: Math.max(.35, value.zoom / 1.2) }))}><ZoomOut className="h-4 w-4" /></Button>
        <span className="w-12 text-center font-mono text-[10px] font-bold text-muted-foreground">{Math.round(camera.zoom * 100)}%</span>
        <Button type="button" size="icon" variant="outline" className="h-9 w-9" title="Aproximar" onClick={() => setCamera((value) => ({ ...value, zoom: Math.min(2.6, value.zoom * 1.2) }))}><ZoomIn className="h-4 w-4" /></Button>
        {mode === "terrain" && isNarrator && (
          <Select value={terrain} onValueChange={(value) => setTerrain(value as LancerHexTerrainType)}>
            <SelectTrigger className="ml-auto h-9 w-40 rounded-md"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TERRAIN_CONFIG) as LancerHexTerrainType[]).map((value) => <SelectItem key={value} value={value}>{TERRAIN_CONFIG[value].label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div ref={containerRef} className="relative min-h-0 overflow-hidden">
          <canvas
            ref={canvasRef}
            className={`block touch-none ${mode === "pan" ? "cursor-grab active:cursor-grabbing" : placingEntityId ? "cursor-crosshair" : "cursor-default"}`}
            onContextMenu={(event) => event.preventDefault()}
            onWheel={(event) => {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
              const nextZoom = Math.min(2.6, Math.max(.35, camera.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
              const world = { x: (pointer.x - camera.x) / camera.zoom, y: (pointer.y - camera.y) / camera.zoom };
              setCamera({ x: pointer.x - world.x * nextZoom, y: pointer.y - world.y * nextZoom, zoom: nextZoom });
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, camera, moved: false };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (drag && (mode === "pan" || event.buttons === 4 || event.button === 1)) {
                const dx = event.clientX - drag.x;
                const dy = event.clientY - drag.y;
                if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
                setCamera({ ...drag.camera, x: drag.camera.x + dx, y: drag.camera.y + dy });
              }
              setHoveredHex(screenToHex(event.clientX, event.clientY));
            }}
            onPointerLeave={() => setHoveredHex(null)}
            onPointerUp={(event) => {
              const drag = dragRef.current;
              dragRef.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
              if (!drag?.moved) {
                const coord = screenToHex(event.clientX, event.clientY);
                if (coord) handleMapClick(coord);
              }
            }}
          />
          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 border border-border bg-[#090f16]/90 px-3 py-2 text-[10px] font-bold uppercase text-muted-foreground backdrop-blur">
            <Crosshair className="h-3.5 w-3.5 text-cyan-300" />
            {hoveredHex ? `Q ${hoveredHex.q} · R ${hoveredHex.r}` : "Passe sobre o mapa"}
            {hoverPath && <><span className="text-border">/</span><span className="text-amber-300">Custo {hoverPath.cost}</span></>}
            {measure && <><span className="text-border">/</span><span className={measure.los ? "text-cyan-300" : "text-rose-300"}>{measure.distance} hex · {measure.los ? "LOS" : "bloqueado"}</span></>}
          </div>
          {placingEntityId && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2 border border-amber-400/40 bg-[#171407]/95 px-3 py-2 text-xs font-bold text-amber-200 shadow-lg">
              Clique em um hex livre para posicionar {displayName(entityById.get(placingEntityId)!)}.
            </div>
          )}
        </div>

        <aside className="min-h-0 overflow-auto border-l border-border bg-[#0c1219] p-4">
          {combatError && (
            <div className="mb-4 border-l-2 border-amber-400 bg-amber-400/10 p-3">
              <div className="text-[10px] font-black uppercase text-amber-200">Combate automatizado indisponível</div>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                Aplique as migrations das Fases 5 e 6 no Supabase. O mapa continua disponível enquanto isso.
              </p>
            </div>
          )}
          <section>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase text-rose-300"><Swords className="h-3.5 w-3.5" /> Combat Manager</div>
              {combat && <Badge variant="outline" className="rounded-sm border-rose-400/30 text-[9px] text-rose-200">R{combat.round} · {combat.current_side}</Badge>}
            </div>
            {!combat ? (
              <Button type="button" className="mt-2 w-full" size="sm" disabled={!isNarrator || startCombat.isPending} onClick={() => startCombat.mutate()}>
                <Swords className="mr-1.5 h-4 w-4" /> Iniciar combate
              </Button>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  {participants.map((participant) => {
                    const entity = entityById.get(participant.entity_id);
                    if (!entity) return null;
                    const active = participant.id === combat.active_participant_id;
                    return (
                      <button
                        key={participant.id}
                        type="button"
                        disabled={!!combat.active_participant_id || participant.has_activated || participant.defeated || activateParticipant.isPending}
                        onClick={() => activateParticipant.mutate(participant)}
                        className={`flex h-10 w-full items-center gap-2 border px-2 text-left transition-colors ${active ? "border-amber-400/70 bg-amber-400/10" : participant.has_activated ? "border-border/50 opacity-50" : "border-border bg-background/30 hover:border-cyan-400/50"}`}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entityColor(entity) }} />
                        <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase">{displayName(entity)}</span>
                        <span className="text-[9px] font-black uppercase text-muted-foreground">{active ? "ativo" : participant.has_activated ? "feito" : participant.side}</span>
                      </button>
                    );
                  })}
                </div>

                {activeParticipant && activeEntity && (
                  <div className="border-l-2 border-amber-400/50 bg-amber-400/5 p-3">
                    <div className="text-[9px] font-black uppercase text-amber-300">Turno de {displayName(activeEntity)}</div>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                      <MiniStat label="Quick" value={activeParticipant.action_economy.quickActionsRemaining} />
                      <MiniStat label="Move" value={activeParticipant.action_economy.standardMoveAvailable ? 1 : 0} />
                      <MiniStat label="React" value={activeParticipant.action_economy.reactionAvailable ? 1 : 0} />
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {activeActions.filter((action) => !!action.attackType).map((action) => (
                        <Button
                          key={action.id}
                          type="button"
                          size="sm"
                          variant={pendingAction?.action.id === action.id ? "default" : "outline"}
                          className="h-auto min-h-9 w-full justify-start py-2 text-left"
                          disabled={actionAvailability.get(action.id)?.allowed === false}
                          title={actionAvailability.get(action.id)?.reason ?? undefined}
                          onClick={() => {
                            if (!activeToken) return void toast.error("O combatente ativo não possui token nesse mapa.");
                            const availability = actionAvailability.get(action.id);
                            if (availability?.allowed === false) return void toast.error(availability.reason ?? "Ação indisponível.");
                            const economy = spendLancerAction(activeParticipant.action_economy, action);
                            if (!economy.allowed) return void toast.error(economy.reason ?? "Ação indisponível.");
                            setSelectedTokenId(activeToken.id);
                            setPendingAction({ action, sourceTokenId: activeToken.id, sourceCompendiumItemId: actionSourceItemId.get(action.id) ?? null });
                            setAttackTargetTokenId(null);
                            setMode("select");
                          }}
                        >
                          <Crosshair className="mr-2 h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0"><span className="block truncate text-[10px] font-black uppercase">{action.name}</span><span className="block text-[9px] text-muted-foreground">{action.activation} · {action.attackType}</span></span>
                        </Button>
                      ))}
                      {activeActions.filter((action) => !!action.attackType).length === 0 && <p className="text-[10px] text-muted-foreground">Nenhum ataque automatizado foi fornecido pela build ativa.</p>}
                    </div>
                    <Button type="button" size="sm" className="mt-3 w-full" variant="secondary" disabled={endTurn.isPending} onClick={() => endTurn.mutate(activeParticipant)}>Encerrar turno</Button>
                  </div>
                )}
                {isNarrator && <Button type="button" size="sm" variant="destructive" className="w-full" disabled={endCombat.isPending} onClick={() => endCombat.mutate()}>Encerrar combate</Button>}
              </div>
            )}
          </section>

          {(pendingEffectsQuery.data ?? []).length > 0 && (
            <>
              <div className="my-4 h-px bg-border" />
              <section>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-amber-200"><Clock3 className="h-3.5 w-3.5" /> Decisões pendentes</div>
                <div className="mt-2 space-y-2">
                  {(pendingEffectsQuery.data ?? []).map((pending) => {
                    const target = entityById.get(pending.target_entity_id);
                    const canResolve = isNarrator || target?.owner_id === userId;
                    return (
                      <article key={pending.id} className="border-l-2 border-amber-400/60 bg-amber-400/5 p-2.5">
                        <div className="text-[10px] font-black uppercase">{pending.effect_kind === "manual_damage" ? "Confirmar dano" : "Efeito opcional"}</div>
                        <div className="mt-1 truncate text-[9px] text-muted-foreground">Alvo: {target ? displayName(target) : "Entidade removida"}</div>
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          <Button type="button" size="sm" className="h-7" disabled={!canResolve || resolvePendingEffect.isPending} onClick={() => resolvePendingEffect.mutate({ pending, apply: true })}><Check className="mr-1 h-3.5 w-3.5" /> Aplicar</Button>
                          <Button type="button" size="sm" variant="outline" className="h-7" disabled={!canResolve || resolvePendingEffect.isPending} onClick={() => resolvePendingEffect.mutate({ pending, apply: false })}><X className="mr-1 h-3.5 w-3.5" /> Recusar</Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {(attackCardsQuery.data ?? []).length > 0 && (
            <>
              <div className="my-4 h-px bg-border" />
              <section>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground"><Dices className="h-3.5 w-3.5" /> Combat Log</div>
                <div className="mt-2 space-y-2">
                  {(attackCardsQuery.data ?? []).slice(0, 3).map((event) => <AttackCard key={event.id} event={event} />)}
                </div>
              </section>
            </>
          )}

          <div className="my-4 h-px bg-border" />
          <section>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> Deploy</div>
            <Select value={placingEntityId || "none"} onValueChange={(value) => { setPlacingEntityId(value === "none" ? "" : value); setMode("select"); }}>
              <SelectTrigger className="mt-2 h-9 rounded-md"><SelectValue placeholder="Posicionar entidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {unplacedEntities.map((entity) => <SelectItem key={entity.id} value={entity.id}>{displayName(entity)}</SelectItem>)}
              </SelectContent>
            </Select>
            {unplacedEntities.length === 0 && <p className="mt-2 text-[10px] text-muted-foreground">Todas as entidades já estão no mapa.</p>}
          </section>

          <div className="my-4 h-px bg-border" />
          {selectedEntity && selectedToken ? (
            <section className="space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[9px] font-black uppercase text-cyan-300">Selected Entity</div>
                    <h3 className="mt-1 font-black uppercase">{displayName(selectedEntity)}</h3>
                    {selectedEntity.callsign && <p className="text-xs text-muted-foreground">{selectedEntity.name}</p>}
                  </div>
                  <Badge variant="outline" className="rounded-sm uppercase">{selectedEntity.entity_type}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniStat label="Speed" value={selectedSpeed} />
                  <MiniStat label="Size" value={Number(selectedEntity.current_state.stats.size ?? 1)} />
                  <MiniStat label="Rev" value={selectedToken.revision} />
                </div>
              </div>
              <div className="space-y-2">
                {resourceEntries(selectedEntity).map(([name, resource]) => (
                  <div key={name} className="border-l-2 border-cyan-400/30 pl-2">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase"><span className="text-muted-foreground">{name}</span><span className="font-mono">{resource.current}/{resource.max}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden bg-slate-800"><div className="h-full bg-cyan-400" style={{ width: `${resource.max > 0 ? Math.max(0, Math.min(100, resource.current / resource.max * 100)) : 0}%` }} /></div>
                  </div>
                ))}
              </div>
              <Button type="button" className="w-full" variant="outline" onClick={() => onOpenEntity(selectedEntity.id)}>Abrir ficha</Button>
              <p className="text-[10px] leading-relaxed text-muted-foreground">O token guarda apenas posição. Recursos e atributos acima são lidos em tempo real da entidade canônica.</p>
            </section>
          ) : (
            <section className="flex min-h-52 flex-col items-center justify-center text-center text-muted-foreground">
              <MousePointer2 className="h-6 w-6" />
              <p className="mt-2 text-xs font-bold uppercase">Selecione um token</p>
              <p className="mt-1 text-[10px]">Use Mover para visualizar os hexes alcançáveis.</p>
            </section>
          )}

          <div className="my-4 h-px bg-border" />
          <section className="space-y-2 text-[10px] text-muted-foreground">
            <Legend icon={Trees} label="Difícil" detail="2 movimento" color="text-yellow-300" />
            <Legend icon={Ban} label="Obstrução" detail="bloqueia movimento/LOS" color="text-slate-300" />
            <Legend icon={Eye} label="Cobertura" detail="soft cover" color="text-cyan-300" />
          </section>
        </aside>
      </div>

      <Dialog open={!!attackTargetEntity} onOpenChange={(open) => { if (!open) setAttackTargetTokenId(null); }}>
        <DialogContent className="max-w-lg rounded-md border-rose-400/30 bg-[#0b1118]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 uppercase"><Crosshair className="h-4 w-4 text-rose-300" /> Attack Preview</DialogTitle>
          </DialogHeader>
          {pendingAction && pendingSourceEntity && attackTargetEntity && targetPreview && (
            <div className="space-y-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-y border-border py-3">
                <div><div className="text-[9px] font-bold uppercase text-muted-foreground">Source</div><div className="truncate text-sm font-black uppercase">{displayName(pendingSourceEntity)}</div></div>
                <Crosshair className="h-5 w-5 text-rose-300" />
                <div className="text-right"><div className="text-[9px] font-bold uppercase text-muted-foreground">Target</div><div className="truncate text-sm font-black uppercase">{displayName(attackTargetEntity)}</div></div>
              </div>
              <div>
                <div className="text-base font-black uppercase">{pendingAction.action.name}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-sm uppercase">{pendingAction.action.activation}</Badge>
                  <Badge variant="outline" className="rounded-sm uppercase">{pendingAction.action.attackType}</Badge>
                  <Badge variant="outline" className={`rounded-sm ${targetPreview.inRange ? "border-cyan-400/40 text-cyan-200" : "border-destructive text-destructive"}`}>Range {targetPreview.distance}/{targetPreview.range}</Badge>
                  <Badge variant="outline" className={`rounded-sm ${targetPreview.hasLos ? "border-cyan-400/40 text-cyan-200" : "border-destructive text-destructive"}`}>{targetPreview.hasLos ? "LOS valid" : "LOS blocked"}</Badge>
                  {targetPreview.cover > 0 && <Badge variant="outline" className="rounded-sm border-amber-400/40 text-amber-200">Cover {targetPreview.cover} · +{targetPreview.coverDifficulty} Difficulty</Badge>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="lancer-attack-accuracy">Accuracy</Label><Input id="lancer-attack-accuracy" type="number" min={0} max={12} value={attackAccuracy} onChange={(event) => setAttackAccuracy(Math.max(0, Number(event.target.value) || 0))} /></div>
                <div className="space-y-1.5"><Label htmlFor="lancer-attack-difficulty">Difficulty manual</Label><Input id="lancer-attack-difficulty" type="number" min={0} max={12} value={attackDifficulty} onChange={(event) => setAttackDifficulty(Math.max(0, Number(event.target.value) || 0))} /></div>
              </div>
              <div className="border-l-2 border-amber-400/50 bg-amber-400/5 p-3">
                <div className="text-[9px] font-black uppercase text-amber-300">Damage sources</div>
                <div className="mt-2 space-y-1 font-mono text-xs">
                  {pendingAction.action.damage.length > 0 ? pendingAction.action.damage.map((damage, index) => <div key={`${damage.type}-${index}`} className="flex justify-between gap-3"><span className="uppercase text-muted-foreground">{damage.type}</span><span className="font-bold">{damage.expression}</span></div>) : <span className="text-muted-foreground">Essa ação não possui dano direto.</span>}
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">A rolagem será criada somente ao confirmar. O resolver aplicará crítico, Armor, Resistance, Structure e Stress; {autoApplyDamage ? "o dano será aplicado automaticamente" : "o dano ficará pendente para confirmação do GM"}.</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAttackTargetTokenId(null)}>Cancelar</Button>
            <Button type="button" disabled={!targetPreview?.inRange || !targetPreview?.hasLos || commitAttack.isPending} onClick={() => commitAttack.mutate()}><Dices className="mr-1.5 h-4 w-4" /> Rolar e resolver</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function hexEqualsToken(coord: HexCoord, token: LancerMapToken | null): boolean {
  return !!token && coord.q === token.q && coord.r === token.r;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="border border-border bg-background/40 px-2 py-2 text-center"><div className="text-[8px] font-bold uppercase text-muted-foreground">{label}</div><div className="mt-1 font-mono text-sm font-black">{value}</div></div>;
}

function Legend({ icon: Icon, label, detail, color }: { icon: typeof Trees; label: string; detail: string; color: string }) {
  return <div className="flex items-center gap-2"><Icon className={`h-3.5 w-3.5 ${color}`} /><span className="font-bold uppercase text-foreground">{label}</span><span className="ml-auto">{detail}</span></div>;
}

function AttackCard({ event }: { event: LancerGameEvent }) {
  const payload = event.payload;
  const outcome = String(payload.outcome ?? "resolved");
  const damage = payload.damage && typeof payload.damage === "object" ? payload.damage as Record<string, unknown> : null;
  const hpDamage = Number(damage?.totalHpDamage ?? 0);
  const heat = Number(damage?.totalHeat ?? 0);
  return (
    <article className={`border-l-2 p-2.5 ${outcome === "miss" ? "border-slate-500 bg-slate-500/5" : outcome === "critical" ? "border-amber-400 bg-amber-400/5" : "border-rose-400 bg-rose-400/5"}`}>
      <div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-black uppercase">{String(payload.actionName ?? "Attack")}</span><span className="font-mono text-[9px] font-bold uppercase text-muted-foreground">{outcome}</span></div>
      <div className="mt-1 truncate text-[9px] text-muted-foreground">{String(payload.sourceName ?? "Source")} → {String(payload.targetName ?? "Target")}</div>
      <div className="mt-2 flex items-end justify-between gap-3"><div><div className="text-[8px] font-bold uppercase text-muted-foreground">Attack</div><div className="font-mono text-lg font-black">{String(payload.total ?? "--")}<span className="text-xs text-muted-foreground">/{String(payload.targetDefense ?? "--")}</span></div></div><div className="text-right"><div className="text-[8px] font-bold uppercase text-muted-foreground">Resolved</div><div className="font-mono text-xs font-black">{hpDamage > 0 ? `${hpDamage} DMG` : heat > 0 ? `${heat} HEAT` : "--"}</div></div></div>
    </article>
  );
}
