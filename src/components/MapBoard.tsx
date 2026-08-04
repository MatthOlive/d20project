import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  X, MousePointer2, Ruler, Pencil, Square, Circle as CircleIcon,
  Minus, Type as TypeIcon, Eraser, Eye, EyeOff, CloudFog, Box, Lightbulb, Trash2,
  ChevronLeft, ChevronRight, Image as ImageIcon, Plus, RotateCw, ArrowUp, ArrowDown,
  Palette, DoorOpen, DoorClosed, Lock, Unlock,
} from "lucide-react";
import { TokenActionBar } from "@/components/TokenActionBar";
import { TokenStatsBar } from "@/components/TokenStatsBar";
import { TokenAvatar, TokenStatusBadges } from "@/components/TokenAvatar";
import { TokenAppearanceDialog, type AppearanceToken } from "@/components/TokenAppearanceDialog";
import { TokenLightDialog, type TokenLightInit } from "@/components/TokenLightDialog";
import { PageSwitcher } from "@/components/PageSwitcher";
import { useIsMobile } from "@/hooks/use-mobile";

export type DragCharacterPayload = {
  kind: "pokemon" | "trainer" | "t20";
  id: string;
  label: string;
  imageUrl?: string | null;
  ownerId: string;
};

export const DRAG_MIME = "application/x-pokerole-character";
export const CHARACTER_POINTER_DROP_EVENT = "d20-character-pointer-drop";

type Token = {
  id: string;
  game_id: string;
  page_id?: string;
  character_kind: "pokemon" | "trainer" | "t20";
  character_id: string;
  label: string;
  image_url: string | null;
  x: number;
  y: number;
  size: number;
  owner_id: string;
  layer?: "tokens" | "gm";
  vision_radius?: number;
  light_radius?: number;
  aura1_radius?: number;
  aura1_color?: string;
  aura2_radius?: number;
  aura2_color?: string;
  tint_color?: string | null;
  bar_label?: string | null;
  bar_value?: number | null;
  bar_max?: number | null;
  bar_color?: string;
  light_enabled?: boolean;
  light_radius_bright?: number;
  light_radius_dim?: number;
  light_color?: string;
  light_angle?: number;
  light_direction?: number;
  vision_enabled?: boolean;
  style?: "token" | "handout";
  explored_mask?: unknown;
};

type MapPing = { id: string; x: number; y: number };

type DrawKind = "freehand" | "rect" | "circle" | "line" | "text";

type Drawing = {
  id: string;
  game_id: string;
  layer: "drawing" | "gm";
  kind: DrawKind;
  geometry: {
    points?: [number, number][];
    x?: number; y?: number; w?: number; h?: number;
    cx?: number; cy?: number; r?: number;
    x1?: number; y1?: number; x2?: number; y2?: number;
    fontSize?: number;
  };
  stroke: string;
  fill: string | null;
  stroke_width: number;
  text_content: string | null;
  author_id: string;
  created_at: string;
};

export type GridSettings = {
  enabled: boolean;
  snap: boolean;
  snapMode?: "center" | "line" | "free";
  size: number;
  color: string;
  opacity: number; // 0-100
  unitMeters: number;
  unitLabel: string;
};

type Mode = "select" | "ruler" | "draw" | "fog" | "walls" | "background";
type WallKind = "wall" | "door" | "window";
type WallTool = "select" | "single" | "poly" | "vision" | "door" | "window";

type FogRegion = { id: string; game_id: string; x: number; y: number; w: number; h: number; revealed: boolean; author_id: string };
type Wall = {
  id: string;
  game_id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind?: WallKind;
  is_open?: boolean;
  locked?: boolean;
  blocks_sight?: boolean;
  blocks_light?: boolean;
};
type MapBg = {
  id: string;
  game_id: string;
  image_url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  crop_x?: number;
  crop_y?: number;
  crop_w?: number;
  crop_h?: number;
  tile_group?: string | null;
  tile_col?: number | null;
  tile_row?: number | null;
};
type BackgroundAddOptions = { cols?: number; rows?: number };

export type Visibility = { fogEnabled: boolean; dynamicLighting: boolean };

const DEFAULT_GRID: GridSettings = {
  enabled: true, snap: true, snapMode: "center", size: 56, color: "#000000",
  opacity: 30, unitMeters: 1.5, unitLabel: "m",
};
const DEFAULT_VIS: Visibility = { fogEnabled: false, dynamicLighting: false };
const WALL_SCHEMA_COLUMNS = ["kind", "is_open", "locked", "blocks_sight", "blocks_light"];

function isSchemaCacheColumnError(error: { message?: string } | null | undefined, columns: string[]) {
  const message = error?.message ?? "";
  return message.includes("schema cache") && columns.some((column) => message.includes(column));
}

export function MapBoard({
  gameId,
  backgroundUrl,
  userId,
  isNarrator,
  activePageId,
  topLeftSlot,
  toolbarSlot,
  onRoll,
  onOpenSheet,
  gridSettings = DEFAULT_GRID,
  visibility = DEFAULT_VIS,
}: {
  gameId: string;
  backgroundUrl: string | null;
  userId: string;
  isNarrator: boolean;
  activePageId: string | null;
  topLeftSlot?: React.ReactNode;
  toolbarSlot?: React.ReactNode;
  onRoll?: (label: string, n: number, penalty?: number, meta?: { characterKind: "trainer" | "pokemon" | "t20"; characterId: string; imageUrl?: string | null }) => void;
  onOpenSheet?: (kind: "trainer" | "pokemon" | "t20", id: string, label: string) => void;
  gridSettings?: GridSettings;
  visibility?: Visibility;
}) {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const boardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [resizeTokenId, setResizeTokenId] = useState<string | null>(null);
  const resizeOrigin = useRef<{ mx: number; my: number; size: number } | null>(null);
  const [localSize, setLocalSize] = useState<Record<string, number>>({});
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [hoverTokenId, setHoverTokenId] = useState<string | null>(null);
  const [appearanceToken, setAppearanceToken] = useState<AppearanceToken | null>(null);
  const [lightToken, setLightToken] = useState<TokenLightInit | null>(null);
  // (background image now rendered full-screen; no aspect-ratio coupling)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panOrigin = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const [mapPings, setMapPings] = useState<MapPing[]>([]);
  const pingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Map tool state
  const [mode, setMode] = useState<Mode>("select");
  const [drawTool, setDrawTool] = useState<DrawKind>("freehand");
  const [drawColor, setDrawColor] = useState("#ef4444");
  const [drawWidth, setDrawWidth] = useState(3);
  const [drawLayer, setDrawLayer] = useState<"drawing" | "gm">("drawing");
  const [showGMLayer, setShowGMLayer] = useState(true);
  const [showBackgrounds, setShowBackgrounds] = useState(true);
  const [showTokens, setShowTokens] = useState(true);

  // For players: a per-user override (game_members.viewing_page_id) lets the
  // narrator route specific players to a different scenario. If no override,
  // the player follows the game's active_page_id.
  const { data: memberOverride = null } = useQuery<string | null>({
    queryKey: ["my-viewing-page", gameId, userId],
    enabled: !isNarrator,
    queryFn: async () => {
      const { data } = await supabase
        .from("game_members")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("viewing_page_id" as any)
        .eq("game_id", gameId)
        .eq("user_id", userId)
        .maybeSingle();
      return ((data as { viewing_page_id?: string | null } | null)?.viewing_page_id) ?? null;
    },
  });
  useEffect(() => {
    if (isNarrator) return;
    const ch = supabase
      .channel(`my-member:${gameId}:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_members", filter: `game_id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ["my-viewing-page", gameId, userId] }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [gameId, userId, isNarrator, qc]);

  const playerEffectivePage = memberOverride ?? activePageId;

  // viewingPageId: which page this client renders.
  // Narrator: starts at activePageId; can change locally without affecting players.
  // Player: always follows playerEffectivePage (override or activePageId).
  const [viewingPageId, setViewingPageId] = useState<string | null>(activePageId);
  useEffect(() => {
    if (!isNarrator) {
      setViewingPageId(playerEffectivePage);
    } else if (!viewingPageId && activePageId) {
      setViewingPageId(activePageId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId, isNarrator, playerEffectivePage]);
  const pageId = viewingPageId;

  const addMapPing = useCallback((x: number, y: number) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMapPings((items) => [...items, { id, x, y }].slice(-8));
    window.setTimeout(() => {
      setMapPings((items) => items.filter((item) => item.id !== id));
    }, 1300);
  }, []);

  useEffect(() => {
    if (!pageId) return;
    const channel = supabase
      .channel(`map-pings:${gameId}:${pageId}`)
      .on("broadcast", { event: "ping" }, ({ payload }) => {
        const ping = payload as { x?: number; y?: number; sender?: string } | null;
        if (!ping || ping.sender === userId) return;
        if (typeof ping.x === "number" && typeof ping.y === "number") addMapPing(ping.x, ping.y);
      })
      .subscribe();
    pingChannelRef.current = channel;
    return () => {
      if (pingChannelRef.current === channel) pingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [gameId, pageId, userId, addMapPing]);

  // Ruler state (local only)
  const [ruler, setRuler] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null);

  // Draw-in-progress state (local until mouseup)
  const [drawingShape, setDrawingShape] = useState<Drawing | null>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-map-token], [data-token-action-bar], [data-map-toolbar]")) return;
      if (mode === "select") setSelectedTokenId(null);
    }
    function onMove(e: MouseEvent) {
      if (panOrigin.current) {
        setPan({
          x: panOrigin.current.ox + e.clientX - panOrigin.current.mx,
          y: panOrigin.current.oy + e.clientY - panOrigin.current.my,
        });
      }
      if (resizeOrigin.current && resizeTokenId) {
        const dx = e.clientX - resizeOrigin.current.mx;
        const dy = e.clientY - resizeOrigin.current.my;
        const next = Math.max(24, Math.min(240, resizeOrigin.current.size + Math.max(dx, dy)));
        setLocalSize((s) => ({ ...s, [resizeTokenId]: next }));
      }
      // Background interactions
      const drag = bgDragRef.current;
      const rect = boardRef.current?.getBoundingClientRect();
      if (drag && rect) {
        if (drag.kind === "move") {
          const dx = (e.clientX - drag.sx) / rect.width / zoom;
          const dy = (e.clientY - drag.sy) / rect.height / zoom;
          setBgLocal((s) => ({ ...s, [drag.id]: { ...(s[drag.id] ?? {}), x: drag.ox + dx, y: drag.oy + dy } }));
        } else if (drag.kind === "resize") {
          const dx = (e.clientX - drag.sx) / rect.width / zoom;
          const dy = (e.clientY - drag.sy) / rect.height / zoom;
          setBgLocal((s) => ({ ...s, [drag.id]: { ...(s[drag.id] ?? {}), width: Math.max(0.03, drag.ow + dx), height: Math.max(0.03, drag.oh + dy) } }));
        } else if (drag.kind === "rotate") {
          const angle = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180 / Math.PI;
          const delta = angle - drag.startAngle;
          setBgLocal((s) => ({ ...s, [drag.id]: { ...(s[drag.id] ?? {}), rotation: drag.baseRotation + delta } }));
        }
      }
    }
    async function onUp() {
      panOrigin.current = null;
      if (resizeOrigin.current && resizeTokenId) {
        const id = resizeTokenId;
        const finalSize = localSize[id];
        resizeOrigin.current = null;
        setResizeTokenId(null);
        if (finalSize) {
          await supabase.from("tokens").update({ size: Math.round(finalSize) }).eq("id", id);
          setLocalSize((s) => { const n = { ...s }; delete n[id]; return n; });
        }
      }
      // Persist bg edit
      const drag = bgDragRef.current;
      if (drag) {
        const local = bgLocalRef.current[drag.id];
        bgDragRef.current = null;
        if (local) {
          const { error } = await (supabase.from("map_backgrounds" as never).update(local as never).eq("id", drag.id) as unknown as Promise<{ error: { message: string } | null }>);
          if (error) toast.error(error.message);
          setBgLocal((s) => { const n = { ...s }; delete n[drag.id]; return n; });
        }
      }
    }
    window.addEventListener("click", onClickAway);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    function onZoom(e: Event) {
      const detail = (e as CustomEvent).detail as { delta?: number; reset?: boolean };
      if (detail?.reset) { setZoom(1); setPan({ x: 0, y: 0 }); return; }
      if (typeof detail?.delta === "number") {
        setZoom((z) => Math.max(0.3, Math.min(4, z * (1 + detail.delta!))));
      }
    }
    window.addEventListener("map-zoom", onZoom as EventListener);
    return () => {
      window.removeEventListener("click", onClickAway);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("map-zoom", onZoom as EventListener);
    };
  }, [resizeTokenId, localSize, mode, zoom]);





  const { data: tokensRaw = [] } = useQuery({
    queryKey: ["tokens", gameId, pageId],
    enabled: !!pageId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tokens").select("*").eq("game_id", gameId).eq("page_id", pageId!);
      if (error) throw error;
      return (data ?? []) as Token[];
    },
  });
  const tokens = useMemo(
    () => tokensRaw.filter((t) => isNarrator || (t.layer ?? "tokens") !== "gm"),
    [tokensRaw, isNarrator],
  );

  // Character ids where the current user is in allowed_editors â†’ treated as creator
  const { data: editableCharIds } = useQuery({
    queryKey: ["editable-char-ids", gameId, userId],
    queryFn: async () => {
      const [pkm, trs] = await Promise.all([
        supabase.from("pokemon").select("id, allowed_editors").eq("game_id", gameId),
        supabase.from("trainers").select("id, allowed_editors").eq("game_id", gameId),
      ]);
      const set = new Set<string>();
      for (const r of (pkm.data ?? []) as { id: string; allowed_editors: string[] | null }[]) {
        if ((r.allowed_editors ?? []).includÛöÒÚ$z{-®éÜj×Ò&fÆW‚fÆW‚Ö6öÂvÓãR&÷&FW"Ö"&÷&FW"Ö&÷&FW""ÓãR#à¢·vU7v—F6†W%6Æ÷GĞ¢·FööÆ&%6Æ÷GĞ¢ÂöF—cà¢—Ğ¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ#à¢ÅFööÄ'Fâ7F—fS×¶ÖöFRÓÓÒ'6VÆV7B'Òöä6Æ–6³×²‚’Óâ6WDÖöFR‚'6VÆV7B"—ÒF—FÆSÒ%6VÆV6–öæ"†6Æ—VRR'&7FRFö¶Vç2’#ãÄÖ÷W6Uö–çFW#"6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×¶ÖöFRÓÓÒ''VÆW"'Òöä6Æ–6³×²‚’Óâ6WDÖöFR‚''VÆW""—ÒF—FÆSÒ%,:–wV†ÖVF—"F—7L:&æ6–’#ãÅ'VÆW"6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×¶ÖöFRÓÓÒ&G&r'Òöä6Æ–6³×²‚’Óâ6WDÖöFR‚&G&r"—ÒF—FÆSÒ$FW6Væ†"#ãÅVæ6–Â6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢¶—4æ'&F÷"bb€¢Ãà¢ÅFööÄ'Fâ7F—fS×¶ÖöFRÓÓÒ&för'Òöä6Æ–6³×²‚’Óâ6WDÖöFR‚&för"—ÒF—FÆSÒ$föröbv"†ÖçVÂ’#ãÄ6Æ÷VDför6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×¶ÖöFRÓÓÒ'vÆÇ2'Òöä6Æ–6³×²‚’Óâ6WDÖöFR‚'vÆÇ2"—ÒF—FÆSÒ%&VFW2†&Æ÷VV–Òf—<:6ò’#ãÄ&÷‚6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×¶ÖöFRÓÓÒ&&6¶w&÷VæB'Òöä6Æ–6³×²‚’Óâ6WDÖöFR‚&&6¶w&÷VæB"—ÒF—FÆSÒ$&6¶w&÷VæG2†Ö÷fW"÷&VF–ÖVç6–öæ"÷&÷F6–öæ"–ÖvVç2’#ãÄ–ÖvT–6öâ6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢Âóà¢—Ğ¢ÂöF—cà¢¶ÖöFRÓÓÒ&G&r"bb€¢Ãà¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ&÷&FW"×B&÷&FW"Ö&÷&FW"BÓ#à¢ÅFööÄ'Fâ7F—fS×¶G&uFööÂÓÓÒ&g&VV†æB'Òöä6Æ–6³×²‚’Óâ6WDG&uFööÂ‚&g&VV†æB"—ÒF—FÆSÒ$6æWFÆ—g&R#ãÅVæ6–Â6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×¶G&uFööÂÓÓÒ'&V7B'Òöä6Æ–6³×²‚’Óâ6WDG&uFööÂ‚'&V7B"—ÒF—FÆSÒ%&WL:&æwVÆò#ãÅ7V&R6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×¶G&uFööÂÓÓÒ&6—&6ÆR'Òöä6Æ–6³×²‚’Óâ6WDG&uFööÂ‚&6—&6ÆR"—ÒF—FÆSÒ$<:×&7VÆò#ãÄ6—&6ÆT–6öâ6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×¶G&uFööÂÓÓÒ&Æ–æR'Òöä6Æ–6³×²‚’Óâ6WDG&uFööÂ‚&Æ–æR"—ÒF—FÆSÒ$Æ–æ†#ãÄÖ–çW26Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×¶G&uFööÂÓÓÒ'FW‡B'Òöä6Æ–6³×²‚’Óâ6WDG&uFööÂ‚'FW‡B"—ÒF—FÆSÒ%FW‡Fò#ãÅG—T–6öâ6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ&÷&FW"×B&÷&FW"Ö&÷&FW"BÓ#à¢Æ–çWBG—SÒ&6öÆ÷""fÇVS×¶G&t6öÆ÷'Òöä6†ævS×²†R’Óâ6WDG&t6öÆ÷"†RçF&vWBçfÇVR—Ò6Æ74æÖSÒ&‚ÓbrÓr7W'6÷"×ö–çFW"&÷VæFVB&÷&FW"&÷&FW"Ö&÷&FW"&r×G&ç7&VçB"F—FÆSÒ$6÷""óà¢Æ–çW@¢G—SÒ'&ævR"Ö–ã×³ÒÖƒ×³'ÒfÇVS×¶G&uv–GF‡Ğ¢öä6†ævS×²†R’Óâ6WDG&uv–GF‚„çVÖ&W"†RçF&vWBçfÇVR’—Ğ¢6Æ74æÖSÒ&‚ÓbrÓb"F—FÆS×¶W7W77W&¢G¶G&uv–GF‡ÖĞ¢óà¢ÂöF—cà¢¶—4æ'&F÷"bb€¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ&÷&FW"×B&÷&FW"Ö&÷&FW"BÓ#à¢ÅFööÄ'Fâ7F—fS×¶G&tÆ–W"ÓÓÒ&G&v–ær'Òöä6Æ–6³×²‚’Óâ6WDG&tÆ–W"‚&G&v–ær"—ÒF—FÆSÒ$FW6Væ†"æ6ÖFf—<:×fVÂ#åf—<:×fVÃÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×¶G&tÆ–W"ÓÓÒ&vÒ'Òöä6Æ–6³×²‚’Óâ6WDG&tÆ–W"‚&vÒ"—ÒF—FÆSÒ$FW6Væ†"<;2&òæ'&F÷"#ätÓÂõFööÄ'Fãà¢ÂöF—cà¢—Ğ¢Âóà¢—Ğ¢¶ÖöFRÓÓÒ&för"bb—4æ'&F÷"bb€¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓ&÷&FW"×B&÷&FW"Ö&÷&FW"BÓ#à¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ#à¢ÅFööÄ'Fâ7F—fS×¶föuFööÂÓÓÒ'&WfVÂ'Òöä6Æ–6³×²‚’Óâ6WDföuFööÂ‚'&WfVÂ"—ÒF—FÆSÒ%–æ6VÃ¢&WfVÆ":&V#å&WfVÆ#ÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×¶föuFööÂÓÓÒ&†–FR'Òöä6Æ–6³×²‚’Óâ6WDföuFööÂ‚&†–FR"—ÒF—FÆSÒ%–æ6VÃ¢ö7VÇF":&V#äö7VÇF#ÂõFööÄ'Fãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ#à¢ÅFööÄ'Fâöä6Æ–6³×¶öå&WfVÄÆÇÒF—FÆSÒ%&WfVÆ"Ö–çFV—&ò#åGVFóÂõFööÄ'Fãà¢ÅFööÄ'Fâöä6Æ–6³×¶öä6ÆV$föwÒF—FÆSÒ$v"FöFför#ãÅG&6ƒ"6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÂöF—cà¢ÂöF—cà¢—Ğ¢¶ÖöFRÓÓÒ'vÆÇ2"bb—4æ'&F÷"bb€¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓ&÷&FW"×B&÷&FW"Ö&÷&FW"BÓ#à¢ÆF—b6Æ74æÖSÒ'‚ÓFW‡BÕ³…ÒföçBÖ&öÆBWW&66RG&6¶–ær×v–FW"FW‡BÖ×WFVBÖf÷&Vw&÷VæB#å&VFW2bfösÂöF—cà¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2Ó2vÓ#à¢ÅFööÄ'Fâ7F—fS×·vÆÅFööÂÓÓÒ'6VÆV7B'Òöä6Æ–6³×²‚’Óâ6WEvÆÅFööÂ‚'6VÆV7B"—ÒF—FÆSÒ%6VÆV6–öæ"&VFR#ãÄÖ÷W6Uö–çFW#"6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×·vÆÅFööÂÓÓÒ'6–ævÆR'Òöä6Æ–6³×²‚’Óâ6WEvÆÅFööÂ‚'6–ævÆR"—ÒF—FÆSÒ%&VFRVæ–6¢"6Æ—VW2#å&VFSÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×·vÆÅFööÂÓÓÒ'öÇ’'Òöä6Æ–6³×²‚’Óâ6WEvÆÅFööÂ‚'öÇ’"—ÒF—FÆSÒ$Æ–æ†6öçF–çVâVçFW"fV6†ÂW626æ6VÆ#åöÇ“ÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×·vÆÅFööÂÓÓÒ'f—6–öâ'Òöä6Æ–6³×²‚’Óâ6WEvÆÅFööÂ‚'f—6–öâ"—ÒF—FÆSÒ$&Æ÷VV–f—6òÂÖ2æòÇW¢#åf—6óÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×·vÆÅFööÂÓÓÒ&Fö÷"'Òöä6Æ–6³×²‚’Óâ6WEvÆÅFööÂ‚&Fö÷""—ÒF—FÆSÒ%÷'F'&RöfV6†ò6Æ–6"#ãÄFö÷$6Æ÷6VB6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×·vÆÅFööÂÓÓÒ'v–æF÷r'Òöä6Æ–6³×²‚’Óâ6WEvÆÅFööÂ‚'v–æF÷r"—ÒF—FÆSÒ$¦æVÆ&Æ÷VV–f—6òÂæòÇW¢#ãÄFö÷$÷Vâ6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÂöF—cà¢·6VÆV7FVEvÆÂbb€¢ÆF—b6Æ74æÖSÒ'76R×’Ó&÷VæFVB&÷&FW"&÷&FW"Ö&÷&FW"&rÖ&6¶w&÷VæBósÓãR#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâFW‡BÕ³…ÒföçBÖ&öÆBWW&66RFW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢Ç7ãç·6VÆV7FVEvÆÂæ¶–æBóò'vÆÂ'ÓÂ÷7ãà¢Æ'WGFöâG—SÒ&'WGFöâ"6Æ74æÖSÒ'&÷VæFVBÓ†÷fW#¦&rÖ66VçB"öä6Æ–6³×²‚’ÓâöäFVÆWFUvÆÂ‡6VÆV7FVEvÆÂæ–B—ÒF—FÆSÒ$W†6ÇV—"&VFR#à¢ÅG&6ƒ"6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óà¢Âö'WGFöãà¢ÂöF—cà¢ÆÆ&VÂ6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓFW‡BÕ³…Ò#à¢Æ–çW@¢G—SÒ&6†V6¶&÷‚ ¢6†V6¶VC×·6VÆV7FVEvÆÂæ&Æö6·5÷6–v‡BÓÒfÇ6WĞ¢öä6†ævS×²†R’ÓâöåWFFUvÆÂ‡6VÆV7FVEvÆÂæ–BÂ²&Æö6·5÷6–v‡C¢RçF&vWBæ6†V6¶VBÒ—Ğ¢óà¢&Æ÷VV–f—6ğ¢ÂöÆ&VÃà¢ÆÆ&VÂ6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓFW‡BÕ³…Ò#à¢Æ–çW@¢G—SÒ&6†V6¶&÷‚ ¢6†V6¶VC×·6VÆV7FVEvÆÂæ&Æö6·5öÆ–v‡BÓÒfÇ6WĞ¢öä6†ævS×²†R’ÓâöåWFFUvÆÂ‡6VÆV7FVEvÆÂæ–BÂ²&Æö6·5öÆ–v‡C¢RçF&vWBæ6†V6¶VBÒ—Ğ¢óà¢&Æ÷VV–ÇW ¢ÂöÆ&VÃà¢²‡6VÆV7FVEvÆÂæ¶–æBÓÓÒ&Fö÷""ÇÂ6VÆV7FVEvÆÂæ¶–æBÓÓÒ'v–æF÷r"’bb€¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ#à¢ÅFööÄ'Fà¢7F—fS×²6VÆV7FVEvÆÂæ—5ö÷VçĞ¢öä6Æ–6³×²‚’ÓâöåWFFUvÆÂ‡6VÆV7FVEvÆÂæ–BÂ²—5ö÷Vã¢6VÆV7FVEvÆÂæ—5ö÷VâÒ—Ğ¢F—FÆS×·6VÆV7FVEvÆÂæ—5ö÷Vâò$fV6†""¢$'&—"'Ğ¢à¢·6VÆV7FVEvÆÂæ—5ö÷VâòÄFö÷$÷Vâ6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óâ¢ÄFö÷$6Æ÷6VB6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óçĞ¢ÂõFööÄ'Fãà¢ÅFööÄ'Fà¢7F—fS×²6VÆV7FVEvÆÂæÆö6¶VGĞ¢öä6Æ–6³×²‚’ÓâöåWFFUvÆÂ‡6VÆV7FVEvÆÂæ–BÂ²Æö6¶VC¢6VÆV7FVEvÆÂæÆö6¶VBÒ—Ğ¢F—FÆS×·6VÆV7FVEvÆÂæÆö6¶VBò$FW7G&æ6""¢%G&æ6"'Ğ¢à¢·6VÆV7FVEvÆÂæÆö6¶VBòÄÆö6²6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óâ¢ÅVæÆö6²6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óçĞ¢ÂõFööÄ'Fãà¢ÂöF—cà¢—Ğ¢ÂöF—cà¢—Ğ¢ÅFööÄ'Fâöä6Æ–6³×¶öä6ÆV%vÆÇ7ÒF—FÆSÒ$v"FöF22&VFW2#ãÅG&6ƒ"6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÂöF—cà¢—Ğ¢¶ÖöFRÓÓÒ&&6¶w&÷VæB"bb—4æ'&F÷"bb€¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓ&÷&FW"×B&÷&FW"Ö&÷&FW"BÓ#à¢Ç6Æ74æÖSÒ'‚ÓFW‡BÕ³…ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#ä6Æ—VRçVÖ–ÖvVÒ&Ö÷fW"÷&VF–ÖVç6–öæ"÷&÷F6–öæ#Â÷à¢Ä&uW&ÄFBöäFC×¶öäFD&6¶w&÷VæGÒóà¢·6VÆV7FVD&t–Bbb€¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ#à¢¶öä'&–æt&tg&öçBbbÅFööÄ'Fâöä6Æ–6³×¶öä'&–æt&tg&öçGÒF—FÆSÒ%G&¦W"&g&VçFR#ãÄ'&÷uW6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'FãçĞ¢¶öå6VæD&t&6²bbÅFööÄ'Fâöä6Æ–6³×¶öå6VæD&t&6·ÒF—FÆSÒ$Vçf–"&G,:2#ãÄ'&÷tF÷vâ6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'FãçĞ¢¶öäFVÆWFU6VÆV7FVD&rbbÅFööÄ'Fâöä6Æ–6³×¶öäFVÆWFU6VÆV7FVD&wÒF—FÆSÒ$W†6ÇV—"&6¶w&÷VæB6VÆV6–öæFò#ãÅG&6ƒ"6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'FãçĞ¢ÂöF—cà¢—Ğ¢ÂöF—cà¢—Ğ¢¶—4æ'&F÷"bb€¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ&÷&FW"×B&÷&FW"Ö&÷&FW"BÓ#à¢ÅFööÄ'Fâ7F—fS×·f—6–&–Æ—G’æfötVæ&ÆVGÒöä6Æ–6³×²‚’ÓâöåFövvÆTför‚f—6–&–Æ—G’æfötVæ&ÆVB—ÒF—FÆS×·f—6–&–Æ—G’æfötVæ&ÆVBò$FW6F—f"föröbv""¢$F—f"föröbv"'Óà¢Ä6Æ÷VDför6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óà¢ÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×·f—6–&–Æ—G’æG–æÖ–4Æ–v‡F–æwÒöä6Æ–6³×²‚’ÓâöåFövvÆTÆ–v‡F–ær‚f—6–&–Æ—G’æG–æÖ–4Æ–v‡F–ær—ÒF—FÆS×·f—6–&–Æ—G’æG–æÖ–4Æ–v‡F–ærò$FW6F—f"f—<:6òF–ì:&Ö–6"¢$F—f"f—<:6òF–ì:&Ö–6'Óà¢ÄÆ–v‡F'VÆ"6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óà¢ÂõFööÄ'Fãà¢²‡f—6–&–Æ—G’æfötVæ&ÆVBÇÂf—6–&–Æ—G’æG–æÖ–4Æ–v‡F–ær’bb€¢ÅFööÄ'Fâ7F—fS×²f—4Væ&ÆVGÒöä6Æ–6³×²‚’Óâ6WEf—4Væ&ÆVB‚f—4Væ&ÆVB—ÒF—FÆS×·f—4Væ&ÆVBò$W66öæFW"förÆö6ÆÖVçFR†æ'&F÷"’"¢$Ö÷7G&"för'Óà¢·f—4Væ&ÆVBòÄW–R6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óâ¢ÄW–Töfb6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óçĞ¢ÂõFööÄ'Fãà¢—Ğ¢ÂöF—cà¢—Ğ¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ&÷&FW"×B&÷&FW"Ö&÷&FW"BÓ#à¢¶—4æ'&F÷"bb€¢Ãà¢ÅFööÄ'Fâ7F—fS×²6†÷ttÔÆ–W'Òöä6Æ–6³×²‚’Óâ6WE6†÷ttÔÆ–W"‚6†÷ttÔÆ–W"—ÒF—FÆS×·6†÷ttÔÆ–W"ò$W66öæFW"6ÖFtÒ"¢$Ö÷7G&"6ÖFtÒ'Óà¢tÒ·6†÷ttÔÆ–W"òÄW–Töfb6Æ74æÖSÒ&‚Ó2rÓ2"óâ¢ÄW–R6Æ74æÖSÒ&‚Ó2rÓ2"óçĞ¢ÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×²6†÷t&6¶w&÷VæG7Òöä6Æ–6³×²‚’Óâ6WE6†÷t&6¶w&÷VæG2‚6†÷t&6¶w&÷VæG2—ÒF—FÆS×·6†÷t&6¶w&÷VæG2ò$W66öæFW"&6¶w&÷VæG2"¢$Ö÷7G&"&6¶w&÷VæG2'Óà¢&r·6†÷t&6¶w&÷VæG2òÄW–Töfb6Æ74æÖSÒ&‚Ó2rÓ2"óâ¢ÄW–R6Æ74æÖSÒ&‚Ó2rÓ2"óçĞ¢ÂõFööÄ'Fãà¢ÅFööÄ'Fâ7F—fS×²6†÷uFö¶Vç7Òöä6Æ–6³×²‚’Óâ6WE6†÷uFö¶Vç2‚6†÷uFö¶Vç2—ÒF—FÆS×·6†÷uFö¶Vç2ò$W66öæFW"Fö¶Vç2"¢$Ö÷7G&"Fö¶Vç2'Óà¢F²·6†÷uFö¶Vç2òÄW–Töfb6Æ74æÖSÒ&‚Ó2rÓ2"óâ¢ÄW–R6Æ74æÖSÒ&‚Ó2rÓ2"óçĞ¢ÂõFööÄ'Fãà¢Âóà¢—Ğ¢ÅFööÄ'Fâöä6Æ–6³×¶öä6ÆV$Ö–æWÒF—FÆSÒ$v"ÖWW2FW6Væ†÷2#ãÄW&6W"6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óãÂõFööÄ'Fãà¢ÂöF—cà¢Âóà¢—Ğ¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâÖöFUF—FÆR†Ó¢ÖöFR’°¢7v—F6‚†Ò’°¢66R'6VÆV7B#¢&WGW&â%6VÆV6–öæ"#°¢66R''VÆW"#¢&WGW&â%,:–wV#°¢66R&G&r#¢&WGW&â$FW6Væ†"#°¢66R&för#¢&WGW&â$föröbv"#°¢66R'vÆÇ2#¢&WGW&â%&VFW2#°¢66R&&6¶w&÷VæB#¢&WGW&â$&6¶w&÷VæG2#°¢Ğ§Ğ ¦gVæ7F–öâFööÄ'Fâ‡²7F—fRÂöä6Æ–6²ÂF—FÆRÂ6†–ÆG&VâÓ¢²7F—fSó¢&ööÆVã²öä6Æ–6³¢‚’Óâfö–C²F—FÆS¢7G&–æs²6†–ÆG&Vã¢&V7Bå&V7DæöFRÒ’°¢&WGW&â€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×¶öä6Æ–6·Ğ¢F—FÆS×·F—FÆWĞ¢6Æ74æÖS×¶–æÆ–æRÖfÆW‚‚ÓrÖ–â×rÕ³#‡…Ò—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ&÷VæFVB‚ÓãRFW‡BÕ³…ÒföçB×6VÖ–&öÆBG&ç6—F–öâG¶7F—fRò&&r×&–Ö'’FW‡B×&–Ö'’Öf÷&Vw&÷VæB"¢&&rÖ&6¶w&÷VæB†÷fW#¦&rÖ66VçB'ÖĞ¢à¢¶6†–ÆG&VçĞ¢Âö'WGFöãà¢“°§Ğ ¦gVæ7F–öâ&uW&ÄFB‡²öäFBÓ¢²öäFC¢‡W&Ã¢7G&–ærÂ÷F–öç3ó¢&6¶w&÷VæDFD÷F–öç2’Óâfö–BÂ&öÖ—6SÇfö–CâÒ’°¢6öç7B·W&ÂÂ6WEW&ÅÒÒW6U7FFR‚""“°¢6öç7B¶6öÇ2Â6WD6öÇ5ÒÒW6U7FFRƒ“°¢6öç7B·&÷w2Â6WE&÷w5ÒÒW6U7FFRƒ“°¢6öç7Bf–ÆT–çWE&VbÒW6U&VcÄ…DÔÄ–çWDVÆVÖVçCâ†çVÆÂ“°¢6öç7BF–ÆT÷F–öç2Ò²6öÇ2Â&÷w2Ó°¢7–æ2gVæ7F–öâ7V&Ö—EW&Â‚’°¢6öç7BRÒW&ÂçG&–Ò‚“°¢–b‚R’&WGW&ã°¢v—BöäFB‡RÂF–ÆT÷F–öç2“°¢6WEW&Â‚""“°¢Ğ¢gVæ7F–öâ†æFÆTf–ÆR†f–ÆS¢f–ÆR’°¢–b‚f–ÆRçG—Rç7F'G5v—F‚‚&–ÖvRò"’’²Fö7BæW'&÷"‚%6VÆV6–öæRVÖ–ÖvVÒ"“²&WGW&ã²Ğ¢–b†f–ÆRç6—¦RâUóó’²Fö7BæW'&÷"‚$–ÖvVÒ×V—Fòw&æFRƒãTÔ"’"“²&WGW&ã²Ğ¢6öç7B&VFW"ÒæWrf–ÆU&VFW"‚“°¢&VFW"æöæÆöBÒ‚’Óâ²fö–BöäFB…7G&–ær‡&VFW"ç&W7VÇB’ÂF–ÆT÷F–öç2“²Ó°¢&VFW"ç&VD4FFU$Â†f–ÆR“°¢Ğ¢&WGW&â€¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓ#à¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓ#à¢Æ–çW@¢G—SÒ'FW‡B ¢fÇVS×·W&ÇĞ¢öä6†ævS×²†R’Óâ6WEW&Â†RçF&vWBçfÇVR—Ğ¢Æ6V†öÆFW#Ò%U$ÂF–ÖvVÒ ¢6Æ74æÖSÒ&‚ÓrfÆW‚Ó&÷VæFVB&÷&FW"&÷&FW"Ö–çWB&rÖ&6¶w&÷VæB‚Ó"FW‡BÕ³…Ò ¢óà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâfö–B7V&Ö—EW&Â‚—Ğ¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚‚Ór—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVB&r×&–Ö'’‚Ó"FW‡BÕ³…ÒföçB×6VÖ–&öÆBFW‡B×&–Ö'’Öf÷&Vw&÷VæB†÷fW#¦÷6—G’Ó“ ¢F—FÆSÒ$F–6–öæ" ¢à¢ÅÇW26Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óà¢Âö'WGFöãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2Ó"vÓ#à¢ÆÆ&VÂ6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓFW‡BÕ³…ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢6öÇVæ0¢Æ–çW@¢G—SÒ&çVÖ&W" ¢Ö–ã×³Ğ¢Öƒ×³'Ğ¢fÇVS×¶6öÇ7Ğ¢öä6†ævS×²†R’Óâ6WD6öÇ2„ÖF‚æÖ‚ƒÂÖF‚æÖ–âƒ"ÂçVÖ&W"†RçF&vWBçfÇVR’ÇÂ’’—Ğ¢6Æ74æÖSÒ&‚ÓrrÖgVÆÂ&÷VæFVB&÷&FW"&÷&FW"Ö–çWB&rÖ&6¶w&÷VæB‚Ó"FW‡BÕ³…ÒFW‡BÖf÷&Vw&÷VæB ¢óà¢ÂöÆ&VÃà¢ÆÆ&VÂ6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓFW‡BÕ³…ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢Æ–æ†0¢Æ–çW@¢G—SÒ&çVÖ&W" ¢Ö–ã×³Ğ¢Öƒ×³'Ğ¢fÇVS×·&÷w7Ğ¢öä6†ævS×²†R’Óâ6WE&÷w2„ÖF‚æÖ‚ƒÂÖF‚æÖ–âƒ"ÂçVÖ&W"†RçF&vWBçfÇVR’ÇÂ’’—Ğ¢6Æ74æÖSÒ&‚ÓrrÖgVÆÂ&÷VæFVB&÷&FW"&÷&FW"Ö–çWB&rÖ&6¶w&÷VæB‚Ó"FW‡BÕ³…ÒFW‡BÖf÷&Vw&÷VæB ¢óà¢ÂöÆ&VÃà¢ÂöF—cà¢Æ–çW@¢&Vc×¶f–ÆT–çWE&VgĞ¢G—SÒ&f–ÆR ¢66WCÒ&–ÖvRò¢ ¢6Æ74æÖSÒ&†–FFVâ ¢öä6†ævS×²†R’Óâ²6öç7BbÒRçF&vWBæf–ÆW3òå³Ó²–b†b’†æFÆTf–ÆR†b“²Ræ7W'&VçEF&vWBçfÇVRÒ"#²×Ğ¢óà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâf–ÆT–çWE&Vbæ7W'&VçCòæ6Æ–6²‚—Ğ¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚‚Ór—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ&÷VæFVB&÷&FW"&÷&FW"Ö&÷&FW"&rÖ&6¶w&÷VæB‚Ó"FW‡BÕ³…ÒföçB×6VÖ–&öÆB†÷fW#¦&rÖ66VçB ¢à¢Ä–ÖvT–6öâ6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óâVçf–"'V—fğ¢Âö'WGFöãà¢ÂöF—cà¢“°§Ğ