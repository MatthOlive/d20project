import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  X, MousePointer2, Ruler, Pencil, Square, Circle as CircleIcon,
  Minus, Type as TypeIcon, Eraser, Eye, EyeOff, CloudFog, Box, Lightbulb, Trash2,
  ChevronLeft, ChevronRight, Image as ImageIcon, Plus, RotateCw, ArrowUp, ArrowDown,
  Palette,
} from "lucide-react";
import { TokenActionBar } from "@/components/TokenActionBar";
import { TokenStatsBar } from "@/components/TokenStatsBar";
import { TokenAvatar, TokenStatusBadges } from "@/components/TokenAvatar";
import { TokenAppearanceDialog, type AppearanceToken } from "@/components/TokenAppearanceDialog";
import { PageSwitcher } from "@/components/PageSwitcher";
import { useIsMobile } from "@/hooks/use-mobile";

export type DragCharacterPayload = {
  kind: "pokemon" | "trainer";
  id: string;
  label: string;
  imageUrl?: string | null;
  ownerId: string;
};

export const DRAG_MIME = "application/x-pokerole-character";

type Token = {
  id: string;
  game_id: string;
  character_kind: "pokemon" | "trainer";
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
};

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
  size: number;
  color: string;
  opacity: number; // 0-100
  unitMeters: number;
  unitLabel: string;
};

type Mode = "select" | "ruler" | "draw" | "fog" | "walls" | "background";

type FogRegion = { id: string; game_id: string; x: number; y: number; w: number; h: number; revealed: boolean; author_id: string };
type Wall = { id: string; game_id: string; x1: number; y1: number; x2: number; y2: number };
type MapBg = { id: string; game_id: string; image_url: string; x: number; y: number; width: number; height: number; rotation: number; z_index: number };

export type Visibility = { fogEnabled: boolean; dynamicLighting: boolean };

const DEFAULT_GRID: GridSettings = {
  enabled: true, snap: true, size: 56, color: "#000000",
  opacity: 30, unitMeters: 1.5, unitLabel: "m",
};
const DEFAULT_VIS: Visibility = { fogEnabled: false, dynamicLighting: false };

export function MapBoard({
  gameId,
  backgroundUrl,
  userId,
  isNarrator,
  activePageId,
  topLeftSlot,
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
  onRoll?: (label: string, n: number, penalty?: number, meta?: { characterKind: "trainer" | "pokemon"; characterId: string; imageUrl?: string | null }) => void;
  onOpenSheet?: (kind: "trainer" | "pokemon", id: string, label: string) => void;
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
  // (background image now rendered full-screen; no aspect-ratio coupling)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panOrigin = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  // Map tool state
  const [mode, setMode] = useState<Mode>("select");
  const [drawTool, setDrawTool] = useState<DrawKind>("freehand");
  const [drawColor, setDrawColor] = useState("#ef4444");
  const [drawWidth, setDrawWidth] = useState(3);
  const [drawLayer, setDrawLayer] = useState<"drawing" | "gm">("drawing");
  const [showGMLayer, setShowGMLayer] = useState(true);
  const [showBackgrounds, setShowBackgrounds] = useState(true);
  const [showTokens, setShowTokens] = useState(true);

  // viewingPageId: which page this client renders.
  // Narrator: starts at activePageId; can change locally without affecting players.
  // Player: always follows activePageId from the games row.
  const [viewingPageId, setViewingPageId] = useState<string | null>(activePageId);
  useEffect(() => {
    if (!isNarrator) {
      setViewingPageId(activePageId);
    } else if (!viewingPageId && activePageId) {
      setViewingPageId(activePageId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId, isNarrator]);
  const pageId = viewingPageId;

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

  // Character ids where the current user is in allowed_editors → treated as creator
  const { data: editableCharIds } = useQuery({
    queryKey: ["editable-char-ids", gameId, userId],
    queryFn: async () => {
      const [pkm, trs] = await Promise.all([
        supabase.from("pokemon").select("id, allowed_editors").eq("game_id", gameId),
        supabase.from("trainers").select("id, allowed_editors").eq("game_id", gameId),
      ]);
      const set = new Set<string>();
      for (const r of (pkm.data ?? []) as { id: string; allowed_editors: string[] | null }[]) {
        if ((r.allowed_editors ?? []).includes(userId)) set.add(r.id);
      }
      for (const r of (trs.data ?? []) as { id: string; allowed_editors: string[] | null }[]) {
        if ((r.allowed_editors ?? []).includes(userId)) set.add(r.id);
      }
      return set;
    },
  });
  const canActAsOwner = useCallback(
    (t: Token) => t.owner_id === userId || (editableCharIds?.has(t.character_id) ?? false),
    [userId, editableCharIds],
  );

  useEffect(() => {
    if (!pageId) return;
    const ch = supabase
      .channel(`tokens:${gameId}:${pageId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tokens", filter: `page_id=eq.${pageId}` },
        () => qc.invalidateQueries({ queryKey: ["tokens", gameId, pageId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [gameId, pageId, qc]);

  // Real-time updates from pokemon / trainers so token images, stats,
  // status conditions and attribute bonuses propagate live to every player.
  useEffect(() => {
    const ch = supabase
      .channel(`token-chars:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pokemon", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const id = (payload.new as { id?: string } | null)?.id
            ?? (payload.old as { id?: string } | null)?.id;
          qc.invalidateQueries({ queryKey: ["token-pokemon", id] });
          qc.invalidateQueries({ queryKey: ["token-pokemon-stats", id] });
          qc.invalidateQueries({ queryKey: ["token-pokemon-status", id] });
          qc.invalidateQueries({ queryKey: ["pokemon", id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trainers", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const id = (payload.new as { id?: string } | null)?.id
            ?? (payload.old as { id?: string } | null)?.id;
          qc.invalidateQueries({ queryKey: ["token-trainer", id] });
          qc.invalidateQueries({ queryKey: ["token-trainer-stats", id] });
          qc.invalidateQueries({ queryKey: ["token-trainer-status", id] });
          qc.invalidateQueries({ queryKey: ["trainer", id] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [gameId, qc]);

  // Drawings query + realtime
  const { data: drawings = [] } = useQuery({
    queryKey: ["map_drawings", gameId, pageId],
    enabled: !!pageId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("map_drawings" as never).select("*").eq("game_id", gameId).eq("page_id", pageId!) as unknown as Promise<{ data: Drawing[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return (data ?? []) as Drawing[];
    },
  });
  useEffect(() => {
    if (!pageId) return;
    const ch = supabase
      .channel(`drawings:${gameId}:${pageId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "map_drawings", filter: `page_id=eq.${pageId}` },
        () => qc.invalidateQueries({ queryKey: ["map_drawings", gameId, pageId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [gameId, pageId, qc]);

  const visibleDrawings = useMemo(
    () => drawings.filter((d) => d.layer !== "gm" || (isNarrator && showGMLayer)),
    [drawings, isNarrator, showGMLayer],
  );

  // ───────────── Map Backgrounds (multi-image layer) ─────────────
  const [selectedBgId, setSelectedBgId] = useState<string | null>(null);
  const bgDragRef = useRef<
    | { id: string; kind: "move"; sx: number; sy: number; ox: number; oy: number }
    | { id: string; kind: "resize"; sx: number; sy: number; ow: number; oh: number }
    | { id: string; kind: "rotate"; cx: number; cy: number; startAngle: number; baseRotation: number }
    | null
  >(null);
  const [bgLocal, setBgLocal] = useState<Record<string, Partial<MapBg>>>({});
  const bgLocalRef = useRef(bgLocal);
  useEffect(() => { bgLocalRef.current = bgLocal; }, [bgLocal]);

  const { data: mapBgsRaw = [] } = useQuery({
    queryKey: ["map_backgrounds", gameId, pageId],
    enabled: !!pageId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("map_backgrounds" as never).select("*").eq("game_id", gameId).eq("page_id", pageId!).order("z_index", { ascending: true }) as unknown as Promise<{ data: MapBg[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return (data ?? []) as MapBg[];
    },
  });
  useEffect(() => {
    if (!pageId) return;
    const ch = supabase
      .channel(`map_backgrounds:${gameId}:${pageId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "map_backgrounds", filter: `page_id=eq.${pageId}` },
        () => qc.invalidateQueries({ queryKey: ["map_backgrounds", gameId, pageId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [gameId, pageId, qc]);

  const mapBgs = useMemo<MapBg[]>(
    () => mapBgsRaw.map((b) => ({ ...b, ...(bgLocal[b.id] ?? {}) })),
    [mapBgsRaw, bgLocal],
  );

  async function addBackground(url: string) {
    if (!isNarrator || !url || !pageId) return;
    const maxZ = mapBgsRaw.reduce((m, b) => Math.max(m, b.z_index), 0);
    const { error } = await (supabase.from("map_backgrounds" as never).insert({
      game_id: gameId, page_id: pageId, image_url: url, x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0, z_index: maxZ + 1, created_by: userId,
    } as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function deleteBackground(id: string) {
    const { error } = await (supabase.from("map_backgrounds" as never).delete().eq("id", id) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
    if (selectedBgId === id) setSelectedBgId(null);
  }
  async function persistBg(id: string, patch: Partial<MapBg>) {
    const { error } = await (supabase.from("map_backgrounds" as never).update(patch as never).eq("id", id) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
    setBgLocal((s) => { const n = { ...s }; delete n[id]; return n; });
  }
  async function reorderBg(id: string, dir: "front" | "back") {
    const bg = mapBgsRaw.find((b) => b.id === id);
    if (!bg) return;
    const maxZ = mapBgsRaw.reduce((m, b) => Math.max(m, b.z_index), 0);
    const minZ = mapBgsRaw.reduce((m, b) => Math.min(m, b.z_index), 0);
    await persistBg(id, { z_index: dir === "front" ? maxZ + 1 : minZ - 1 });
  }


  // ───────────── Fog of War + Walls (Phase 2) ─────────────
  const [fogTool, setFogTool] = useState<"reveal" | "hide">("reveal");
  const [fogRect, setFogRect] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null);
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [wallCursor, setWallCursor] = useState<{ x: number; y: number } | null>(null);
  const [visEnabled, setVisEnabled] = useState(true);
  const fogActive = visibility.fogEnabled || visibility.dynamicLighting;

  const { data: fogRegions = [] } = useQuery({
    queryKey: ["fog_regions", gameId, pageId],
    enabled: !!pageId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("fog_regions" as never).select("*").eq("game_id", gameId).eq("page_id", pageId!) as unknown as Promise<{ data: FogRegion[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return (data ?? []) as FogRegion[];
    },
  });
  const { data: walls = [] } = useQuery({
    queryKey: ["walls", gameId, pageId],
    enabled: !!pageId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("walls" as never).select("*").eq("game_id", gameId).eq("page_id", pageId!) as unknown as Promise<{ data: Wall[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return (data ?? []) as Wall[];
    },
  });
  useEffect(() => {
    if (!pageId) return;
    const ch1 = supabase.channel(`fog:${gameId}:${pageId}`).on("postgres_changes",
      { event: "*", schema: "public", table: "fog_regions", filter: `page_id=eq.${pageId}` },
      () => qc.invalidateQueries({ queryKey: ["fog_regions", gameId, pageId] })).subscribe();
    const ch2 = supabase.channel(`walls:${gameId}:${pageId}`).on("postgres_changes",
      { event: "*", schema: "public", table: "walls", filter: `page_id=eq.${pageId}` },
      () => qc.invalidateQueries({ queryKey: ["walls", gameId, pageId] })).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [gameId, pageId, qc]);

  async function insertFogRegion(ax: number, ay: number, bx: number, by: number, revealed: boolean) {
    if (!pageId) return;
    const x = Math.min(ax, bx), y = Math.min(ay, by);
    const w = Math.abs(bx - ax), h = Math.abs(by - ay);
    if (w < 0.005 || h < 0.005) return;
    const { error } = await (supabase.from("fog_regions" as never).insert({ game_id: gameId, page_id: pageId, x, y, w, h, revealed, author_id: userId } as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function clearFog() {
    if (!pageId) return;
    if (!confirm("Apagar toda a fog desta página?")) return;
    const { error } = await (supabase.from("fog_regions" as never).delete().eq("page_id", pageId) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function revealAll() {
    if (!pageId) return;
    const { error } = await (supabase.from("fog_regions" as never).insert({ game_id: gameId, page_id: pageId, x: 0, y: 0, w: 1, h: 1, revealed: true, author_id: userId } as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function insertWall(x1: number, y1: number, x2: number, y2: number) {
    if (!pageId) return;
    if (Math.hypot(x2 - x1, y2 - y1) < 0.01) return;
    const { error } = await (supabase.from("walls" as never).insert({ game_id: gameId, page_id: pageId, x1, y1, x2, y2, author_id: userId } as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function deleteWall(id: string) {
    const { error } = await (supabase.from("walls" as never).delete().eq("id", id) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function clearWalls() {
    if (!pageId) return;
    if (!confirm("Apagar todas as paredes desta página?")) return;
    const { error } = await (supabase.from("walls" as never).delete().eq("page_id", pageId) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function toggleGameFlag(field: "fog_enabled" | "dynamic_lighting", value: boolean) {
    const { error } = await (supabase.from("games").update({ [field]: value } as never).eq("id", gameId) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["game", gameId] });
  }
  async function setTokenVision(t: Token) {
    const cur = t.vision_radius ?? 0;
    const raw = window.prompt(`Raio de visão de "${t.label}" (em células, 0 = sem visão):`, String(cur));
    if (raw === null) return;
    const n = Math.max(0, Math.min(60, Number(raw) || 0));
    const { error } = await (supabase.from("tokens").update({ vision_radius: n } as never).eq("id", t.id) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }

  // Visibility polygons (raycasting) — computed when dynamicLighting is on.
  const visibilityPolygons = useMemo(() => {
    if (!visibility.dynamicLighting) return [] as string[];
    const rect = (innerRef.current ?? boardRef.current)?.getBoundingClientRect();
    if (!rect) return [];
    const sources = isNarrator
      ? tokens.filter((t) => (t.vision_radius ?? 0) > 0)
      : tokens.filter((t) => canActAsOwner(t) && (t.vision_radius ?? 0) > 0);
    if (sources.length === 0) return [];
    const W = rect.width, H = rect.height;
    const wallsPx = walls.map((w) => ({ ax: w.x1 * W, ay: w.y1 * H, bx: w.x2 * W, by: w.y2 * H }));
    const out: string[] = [];
    for (const t of sources) {
      const ox = t.x * W, oy = t.y * H;
      const radius = (t.vision_radius ?? 0) * gridSettings.size;
      const N = 96;
      const pts: [number, number][] = [];
      for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        let bestT = radius;
        for (const w of wallsPx) {
          const sx = w.ax - ox, sy = w.ay - oy;
          const rx = w.bx - w.ax, ry = w.by - w.ay;
          const denom = dx * ry - dy * rx;
          if (Math.abs(denom) < 1e-6) continue;
          const tt = (sx * ry - sy * rx) / denom;
          const uu = (sx * dy - sy * dx) / denom;
          if (tt >= 0 && tt < bestT && uu >= 0 && uu <= 1) bestT = tt;
        }
        pts.push([ox + dx * bestT, oy + dy * bestT]);
      }
      // Convert to viewBox 1000x1000 coords
      const path = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${(px / W) * 1000},${(py / H) * 1000}`).join(" ") + " Z";
      out.push(path);
    }
    return out;
  }, [tokens, walls, visibility.dynamicLighting, isNarrator, userId, gridSettings.size]);
  // ─────────────────────────────────────────────────────────

  function snap(v: number, dim: number) {
    if (!gridSettings.snap || !gridSettings.enabled) return Math.max(0, Math.min(1, v));
    const px = v * dim;
    const cell = Math.round(px / gridSettings.size) * gridSettings.size;
    return Math.max(0, Math.min(1, cell / dim));
  }

  function pointToRelRaw(clientX: number, clientY: number) {
    const target = innerRef.current ?? boardRef.current!;
    const rect = target.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
      rectW: rect.width, rectH: rect.height,
    };
  }
  function pointToRel(clientX: number, clientY: number) {
    const target = innerRef.current ?? boardRef.current!;
    const rect = target.getBoundingClientRect();
    return {
      x: snap((clientX - rect.left) / rect.width, rect.width),
      y: snap((clientY - rect.top) / rect.height, rect.height),
    };
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setZoom((z) => Math.max(0.3, Math.min(4, z * (1 + delta))));
  }
  function onContextMenu(e: React.MouseEvent) { e.preventDefault(); }
  function onMouseDown(e: React.MouseEvent) {
    // Right click pans
    if (e.button === 2) {
      e.preventDefault();
      panOrigin.current = { mx: e.clientX, my: e.clientY, ox: pan.x, oy: pan.y };
      return;
    }
    if (e.button !== 0) return;
    // Ignore clicks on tokens / action bar / toolbar
    const target = e.target as HTMLElement | null;
    if (target?.closest("[data-map-token], [data-token-action-bar], [data-map-toolbar]")) return;

    if (mode === "ruler") {
      const p = pointToRelRaw(e.clientX, e.clientY);
      setRuler({ ax: p.x, ay: p.y, bx: p.x, by: p.y });
      return;
    }
    if (mode === "draw") {
      const p = pointToRelRaw(e.clientX, e.clientY);
      const base: Drawing = {
        id: "tmp",
        game_id: gameId,
        layer: drawLayer,
        kind: drawTool,
        geometry: {},
        stroke: drawColor,
        fill: null,
        stroke_width: drawWidth,
        text_content: null,
        author_id: userId,
        created_at: new Date().toISOString(),
      };
      if (drawTool === "freehand") base.geometry = { points: [[p.x, p.y]] };
      else if (drawTool === "rect") base.geometry = { x: p.x, y: p.y, w: 0, h: 0 };
      else if (drawTool === "circle") base.geometry = { cx: p.x, cy: p.y, r: 0 };
      else if (drawTool === "line") base.geometry = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      else if (drawTool === "text") {
        const text = window.prompt("Texto:");
        if (!text) return;
        base.geometry = { x: p.x, y: p.y, fontSize: 16 };
        base.text_content = text;
        void persistDrawing(base);
        return;
      }
      setDrawingShape(base);
    }
    if (mode === "fog" && isNarrator) {
      const p = pointToRelRaw(e.clientX, e.clientY);
      setFogRect({ ax: p.x, ay: p.y, bx: p.x, by: p.y });
      return;
    }
    if (mode === "walls" && isNarrator) {
      const p = pointToRelRaw(e.clientX, e.clientY);
      if (!wallStart) {
        setWallStart({ x: p.x, y: p.y });
        setWallCursor({ x: p.x, y: p.y });
      } else {
        void insertWall(wallStart.x, wallStart.y, p.x, p.y);
        setWallStart(null);
        setWallCursor(null);
      }
      return;
    }
  }
  function onMouseMoveBoard(e: React.MouseEvent) {
    if (mode === "ruler" && ruler) {
      const p = pointToRelRaw(e.clientX, e.clientY);
      setRuler({ ...ruler, bx: p.x, by: p.y });
      return;
    }
    if (mode === "fog" && fogRect) {
      const p = pointToRelRaw(e.clientX, e.clientY);
      setFogRect({ ...fogRect, bx: p.x, by: p.y });
      return;
    }
    if (mode === "walls" && wallStart) {
      const p = pointToRelRaw(e.clientX, e.clientY);
      setWallCursor({ x: p.x, y: p.y });
      return;
    }
    if (mode === "draw" && drawingShape) {
      const p = pointToRelRaw(e.clientX, e.clientY);
      setDrawingShape((cur) => {
        if (!cur) return cur;
        if (cur.kind === "freehand") {
          const points = [...(cur.geometry.points ?? []), [p.x, p.y] as [number, number]];
          return { ...cur, geometry: { points } };
        }
        if (cur.kind === "rect") {
          const x0 = cur.geometry.x!, y0 = cur.geometry.y!;
          return { ...cur, geometry: { x: Math.min(x0, p.x), y: Math.min(y0, p.y), w: Math.abs(p.x - x0), h: Math.abs(p.y - y0) } };
        }
        if (cur.kind === "circle") {
          const cx = cur.geometry.cx!, cy = cur.geometry.cy!;
          const r = Math.hypot(p.x - cx, p.y - cy);
          return { ...cur, geometry: { cx, cy, r } };
        }
        if (cur.kind === "line") {
          return { ...cur, geometry: { x1: cur.geometry.x1!, y1: cur.geometry.y1!, x2: p.x, y2: p.y } };
        }
        return cur;
      });
    }
  }
  async function onMouseUpBoard() {
    if (mode === "ruler") {
      return;
    }
    if (mode === "fog" && fogRect) {
      await insertFogRegion(fogRect.ax, fogRect.ay, fogRect.bx, fogRect.by, fogTool === "reveal");
      setFogRect(null);
      return;
    }
    if (mode === "draw" && drawingShape) {
      const d = drawingShape;
      setDrawingShape(null);
      if (d.kind === "rect" && ((d.geometry.w ?? 0) < 0.005 || (d.geometry.h ?? 0) < 0.005)) return;
      if (d.kind === "circle" && (d.geometry.r ?? 0) < 0.005) return;
      if (d.kind === "line") {
        const dx = (d.geometry.x2! - d.geometry.x1!), dy = (d.geometry.y2! - d.geometry.y1!);
        if (Math.hypot(dx, dy) < 0.005) return;
      }
      if (d.kind === "freehand" && (d.geometry.points?.length ?? 0) < 2) return;
      await persistDrawing(d);
    }
  }
  async function persistDrawing(d: Drawing) {
    const payload = {
      game_id: d.game_id,
      layer: d.layer,
      kind: d.kind,
      geometry: d.geometry,
      stroke: d.stroke,
      fill: d.fill,
      stroke_width: d.stroke_width,
      text_content: d.text_content,
      author_id: d.author_id,
    };
    const { error } = await (supabase.from("map_drawings" as never).insert(payload as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function deleteDrawing(id: string) {
    const { error } = await (supabase.from("map_drawings" as never).delete().eq("id", id) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function clearMyDrawings() {
    if (!confirm("Apagar todos os seus desenhos neste mapa?")) return;
    const q = supabase.from("map_drawings" as never).delete().eq("game_id", gameId).eq("author_id", userId);
    const { error } = await (q as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer.getData(DRAG_MIME);
    const { x, y } = pointToRel(e.clientX, e.clientY);
    if (raw) {
      const p = JSON.parse(raw) as DragCharacterPayload;
      const { error } = await supabase.from("tokens").insert({
        game_id: gameId,
        character_kind: p.kind,
        character_id: p.id,
        label: p.label,
        image_url: p.imageUrl ?? null,
        owner_id: p.ownerId,
        x, y,
      });
      if (error) toast.error(error.message);
      return;
    }
    if (dragId) {
      const t = tokens.find((tk) => tk.id === dragId);
      if (!t) return;
      qc.setQueryData<Token[]>(["tokens", gameId], (old) =>
        (old ?? []).map((tk) => (tk.id === dragId ? { ...tk, x, y } : tk)));
      const { error } = await supabase.from("tokens").update({ x, y }).eq("id", dragId);
      if (error) toast.error(error.message);
      setDragId(null);
    }
  }

  async function removeToken(id: string) {
    const { error } = await supabase.from("tokens").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  function onTokenPointerDown(e: React.PointerEvent, t: Token, canMove: boolean) {
    if (!canMove || mode !== "select") return;
    if (e.pointerType === "mouse") return; // mouse keeps native HTML5 drag
    e.preventDefault();
    e.stopPropagation();
    setDragId(t.id);
    const move = (ev: PointerEvent) => {
      const { x, y } = pointToRel(ev.clientX, ev.clientY);
      qc.setQueryData<Token[]>(["tokens", gameId], (old) =>
        (old ?? []).map((tk) => (tk.id === t.id ? { ...tk, x, y } : tk)),
      );
    };
    const up = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const { x, y } = pointToRel(ev.clientX, ev.clientY);
      setDragId(null);
      const { error } = await supabase.from("tokens").update({ x, y }).eq("id", t.id);
      if (error) toast.error(error.message);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  async function toggleTokenLayer(id: string, current: "tokens" | "gm") {
    const next = current === "gm" ? "tokens" : "gm";
    const { error } = await (supabase.from("tokens").update({ layer: next } as never).eq("id", id) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }

  // Ruler computed distance
  const rulerInfo = useMemo(() => {
    if (!ruler) return null;
    const rect = (innerRef.current ?? boardRef.current)?.getBoundingClientRect();
    if (!rect) return null;
    const dx = (ruler.bx - ruler.ax) * rect.width;
    const dy = (ruler.by - ruler.ay) * rect.height;
    const distPx = Math.hypot(dx, dy);
    const cells = distPx / Math.max(1, gridSettings.size);
    const meters = cells * gridSettings.unitMeters;
    return { distPx, cells, meters };
  }, [ruler, gridSettings.size, gridSettings.unitMeters]);

  return (
    <>
    <div className="flex h-full w-full items-center justify-center">
    <div
      ref={boardRef}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDrop={onDrop}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMoveBoard}
      onMouseUp={onMouseUpBoard}
      className="relative h-full w-full overflow-hidden rounded-xl border border-border bg-muted"
      style={{
        cursor: mode === "ruler" || mode === "draw" || mode === "fog" || mode === "walls" ? "crosshair" : undefined,
      }}
    >
      {topLeftSlot && <div className="absolute right-3 top-3 z-30 flex items-center gap-2">{topLeftSlot}</div>}

      {/* Map toolbar (top-left, collapsible) */}
      <MapToolbar
        mode={mode} setMode={setMode}
        drawTool={drawTool} setDrawTool={setDrawTool}
        drawColor={drawColor} setDrawColor={setDrawColor}
        drawWidth={drawWidth} setDrawWidth={setDrawWidth}
        drawLayer={drawLayer} setDrawLayer={setDrawLayer}
        isNarrator={isNarrator}
        showGMLayer={showGMLayer} setShowGMLayer={setShowGMLayer}
        onClearMine={clearMyDrawings}
        isMobile={isMobile}
        visibility={visibility}
        fogTool={fogTool} setFogTool={setFogTool}
        onClearFog={clearFog}
        onRevealAll={revealAll}
        onClearWalls={clearWalls}
        onToggleFog={(v) => toggleGameFlag("fog_enabled", v)}
        onToggleLighting={(v) => toggleGameFlag("dynamic_lighting", v)}
        visEnabled={visEnabled} setVisEnabled={setVisEnabled}
        onAddBackground={addBackground}
        onDeleteSelectedBg={selectedBgId ? () => void deleteBackground(selectedBgId) : undefined}
        onSendBgBack={selectedBgId ? () => void reorderBg(selectedBgId, "back") : undefined}
        onBringBgFront={selectedBgId ? () => void reorderBg(selectedBgId, "front") : undefined}
        selectedBgId={selectedBgId}
      />

      <div
        ref={innerRef}
        className="absolute inset-0 origin-center"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          ...(backgroundUrl
            ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : {}),
        }}
      >
      {/* Multi-image background layer */}
      {mapBgs.map((bg) => {
        const isSel = selectedBgId === bg.id;
        const editable = isNarrator && mode === "background";
        return (
          <div
            key={bg.id}
            className={`absolute ${editable ? "cursor-move" : "pointer-events-none"} ${isSel ? "outline-2 outline-amber-400 outline-dashed" : ""}`}
            style={{
              left: `${bg.x * 100}%`,
              top: `${bg.y * 100}%`,
              width: `${bg.width * 100}%`,
              height: `${bg.height * 100}%`,
              transform: `rotate(${bg.rotation}deg)`,
              transformOrigin: "center center",
              zIndex: 0,
            }}
            onMouseDown={(e) => {
              if (!editable) return;
              e.stopPropagation();
              setSelectedBgId(bg.id);
              bgDragRef.current = { id: bg.id, kind: "move", sx: e.clientX, sy: e.clientY, ox: bg.x, oy: bg.y };
            }}
          >
            <img
              src={bg.image_url}
              alt=""
              draggable={false}
              className="pointer-events-none h-full w-full select-none"
              style={{ objectFit: "fill" }}
            />
            {editable && isSel && (
              <>
                {/* resize handle (bottom-right) */}
                <div
                  className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded-sm border-2 border-amber-400 bg-background shadow"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    bgDragRef.current = { id: bg.id, kind: "resize", sx: e.clientX, sy: e.clientY, ow: bg.width, oh: bg.height };
                  }}
                />
                {/* rotate handle (top) */}
                <div
                  className="absolute -top-8 left-1/2 -translate-x-1/2 cursor-grab rounded-full border-2 border-amber-400 bg-background p-1 shadow"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const target = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
                    const cx = target.left + target.width / 2;
                    const cy = target.top + target.height / 2;
                    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
                    bgDragRef.current = { id: bg.id, kind: "rotate", cx, cy, startAngle, baseRotation: bg.rotation };
                  }}
                >
                  <RotateCw className="h-3 w-3" />
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* grid overlay */}
      {gridSettings.enabled && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: Math.max(0, Math.min(1, gridSettings.opacity / 100)),
            backgroundImage:
              `linear-gradient(to right, ${gridSettings.color} 1px, transparent 1px), linear-gradient(to bottom, ${gridSettings.color} 1px, transparent 1px)`,
            backgroundSize: `${gridSettings.size}px ${gridSettings.size}px`,
          }}
        />
      )}

      {/* Drawings SVG layer */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
      >
        {visibleDrawings.map((d) => renderDrawing(d, false, isNarrator, userId, deleteDrawing))}
        {drawingShape && renderDrawing(drawingShape, true, isNarrator, userId, deleteDrawing)}
      </svg>

      {/* Walls layer — visible to narrator only */}
      {isNarrator && (walls.length > 0 || (wallStart && wallCursor)) && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          {walls.map((w) => (
            <g key={w.id}>
              <line
                x1={w.x1 * 1000} y1={w.y1 * 1000} x2={w.x2 * 1000} y2={w.y2 * 1000}
                stroke="#ef4444" strokeWidth={3} strokeDasharray="4 3" strokeLinecap="round"
                vectorEffect="non-scaling-stroke" opacity={0.85}
              />
              {mode === "walls" && (
                <g style={{ cursor: "pointer", pointerEvents: "auto" }} onClick={() => deleteWall(w.id)}>
                  <circle cx={(w.x1 + w.x2) / 2 * 1000} cy={(w.y1 + w.y2) / 2 * 1000} r={8} fill="hsl(0 84% 60%)" />
                  <text x={(w.x1 + w.x2) / 2 * 1000} y={(w.y1 + w.y2) / 2 * 1000 + 4} fontSize={11} textAnchor="middle" fill="white" fontWeight="bold">×</text>
                </g>
              )}
            </g>
          ))}
          {wallStart && wallCursor && (
            <line
              x1={wallStart.x * 1000} y1={wallStart.y * 1000}
              x2={wallCursor.x * 1000} y2={wallCursor.y * 1000}
              stroke="#fbbf24" strokeWidth={2} vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}

      {/* Fog of War + Dynamic Lighting */}
      {fogActive && visEnabled && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          <defs>
            <mask id={`fog-mask-${gameId}`}>
              {/* Start fully covered */}
              <rect x="0" y="0" width="1000" height="1000" fill="white" />
              {/* Subtract revealed regions (manual fog) */}
              {visibility.fogEnabled && fogRegions.filter((r) => r.revealed).map((r) => (
                <rect key={r.id} x={r.x * 1000} y={r.y * 1000} width={r.w * 1000} height={r.h * 1000} fill="black" />
              ))}
              {/* Subtract visibility polygons (dynamic lighting) */}
              {visibilityPolygons.map((d, i) => (
                <path key={`vis-${i}`} d={d} fill="black" />
              ))}
              {/* Re-cover hidden regions on top */}
              {visibility.fogEnabled && fogRegions.filter((r) => !r.revealed).map((r) => (
                <rect key={r.id} x={r.x * 1000} y={r.y * 1000} width={r.w * 1000} height={r.h * 1000} fill="white" />
              ))}
            </mask>
          </defs>
          <rect
            x="0" y="0" width="1000" height="1000"
            fill="#000000"
            opacity={isNarrator ? 0.5 : 1}
            mask={`url(#fog-mask-${gameId})`}
          />
          {/* Live fog rectangle preview */}
          {isNarrator && mode === "fog" && fogRect && (() => {
            const x = Math.min(fogRect.ax, fogRect.bx) * 1000;
            const y = Math.min(fogRect.ay, fogRect.by) * 1000;
            const w = Math.abs(fogRect.bx - fogRect.ax) * 1000;
            const h = Math.abs(fogRect.by - fogRect.ay) * 1000;
            return (
              <rect x={x} y={y} width={w} height={h}
                fill={fogTool === "reveal" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}
                stroke={fogTool === "reveal" ? "#22c55e" : "#ef4444"} strokeWidth={2}
                strokeDasharray="4 3" vectorEffect="non-scaling-stroke"
              />
            );
          })()}
        </svg>
      )}

      {/* Ruler overlay */}
      {ruler && rulerInfo && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          <line
            x1={ruler.ax * 1000} y1={ruler.ay * 1000}
            x2={ruler.bx * 1000} y2={ruler.by * 1000}
            stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={ruler.ax * 1000} cy={ruler.ay * 1000} r={5} fill="#fbbf24" vectorEffect="non-scaling-stroke" />
          <circle cx={ruler.bx * 1000} cy={ruler.by * 1000} r={5} fill="#fbbf24" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {ruler && rulerInfo && (
        <div
          className="pointer-events-none absolute z-20 rounded bg-black/80 px-2 py-1 text-[11px] font-bold text-amber-300 shadow"
          style={{
            left: `${((ruler.ax + ruler.bx) / 2) * 100}%`,
            top: `${((ruler.ay + ruler.by) / 2) * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          {rulerInfo.cells.toFixed(1)} células · {rulerInfo.meters.toFixed(1)} {gridSettings.unitLabel}
        </div>
      )}

      {tokens.map((t) => {
        const canMove = isNarrator || canActAsOwner(t);
        const isSelected = selectedTokenId === t.id;
        const isHover = hoverTokenId === t.id;
        const showStats = isSelected || isHover;
        const onGmLayer = (t.layer ?? "tokens") === "gm";
        return (
          <div
            key={t.id}
              data-map-token
            draggable={canMove && mode === "select"}
            onDragStart={(e) => {
              if (!canMove || mode !== "select") return;
              setDragId(t.id);
              e.dataTransfer.effectAllowed = "move";
              const img = new Image();
              e.dataTransfer.setDragImage(img, 0, 0);
            }}
            onPointerDown={(e) => onTokenPointerDown(e, t, canMove)}
            onMouseEnter={() => setHoverTokenId(t.id)}
            onMouseLeave={() => setHoverTokenId((cur) => (cur === t.id ? null : cur))}
            onClick={(e) => {
              if (mode !== "select") return;
              e.stopPropagation();
              setSelectedTokenId((cur) => (cur === t.id ? null : t.id));
            }}
            className="group absolute -translate-x-1/2 -translate-y-1/2 select-none"
            style={{
              left: `${t.x * 100}%`,
              top: `${t.y * 100}%`,
              width: localSize[t.id] ?? t.size,
              height: localSize[t.id] ?? t.size,
              cursor: mode !== "select" ? "inherit" : canMove ? "grab" : "pointer",
              zIndex: isSelected || isHover ? 20 : 1,
              opacity: onGmLayer ? 0.7 : 1,
              touchAction: canMove && mode === "select" ? "none" : undefined,
              transition: dragId === t.id || resizeTokenId === t.id ? "none" : "left 200ms ease, top 200ms ease, width 120ms ease, height 120ms ease",
            }}
            title={t.label}
          >
            {/* Auras (rendered behind the avatar, sized in grid cells) */}
            {[
              { r: t.aura1_radius ?? 0, c: t.aura1_color ?? "#22c55e" },
              { r: t.aura2_radius ?? 0, c: t.aura2_color ?? "#3b82f6" },
            ].map((a, i) => a.r > 0 ? (
              <div
                key={`aura-${i}`}
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  width: a.r * gridSettings.size * 2,
                  height: a.r * gridSettings.size * 2,
                  backgroundColor: a.c,
                  opacity: 0.18,
                  border: `2px solid ${a.c}`,
                  zIndex: -1,
                }}
              />
            ) : null)}
            {showStats && (
              <div className="pointer-events-none absolute left-1/2 -top-2 -translate-x-1/2 -translate-y-full">
                <TokenStatsBar
                  kind={t.character_kind}
                  id={t.character_id}
                  gameId={gameId}
                  editable={canMove}
                  expanded={isSelected}
                />
              </div>
            )}
            {/* Custom bar (always visible above token when configured) */}
            {(t.bar_label && t.bar_max && t.bar_max > 0) && (
              <div className="pointer-events-none absolute left-1/2 -top-3 -translate-x-1/2 -translate-y-full flex flex-col items-center gap-0.5">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted/70 ring-1 ring-background/80">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, ((t.bar_value ?? 0) / t.bar_max) * 100))}%`,
                      backgroundColor: t.bar_color ?? "#f59e0b",
                    }}
                  />
                </div>
                <span className="rounded bg-background/80 px-1 text-[8px] font-bold uppercase tracking-wider text-foreground/80">
                  {t.bar_label}
                </span>
              </div>
            )}
            <div className={`relative flex h-full w-full items-center justify-center rounded-full border-2 ${isSelected ? "border-amber-400 ring-2 ring-amber-400/50" : onGmLayer ? "border-purple-500 ring-2 ring-purple-500/40 border-dashed" : "border-primary ring-2 ring-background"} bg-card shadow-md`}>
              <TokenAvatar
                kind={t.character_kind}
                id={t.character_id}
                fallbackImage={t.image_url ?? null}
                label={t.label}
              />
              <TokenStatusBadges kind={t.character_kind} id={t.character_id} />
              {t.tint_color && (
                <div
                  className="pointer-events-none absolute inset-0 rounded-full"
                  style={{ backgroundColor: t.tint_color, opacity: 0.45, mixBlendMode: "multiply" }}
                />
              )}
              {onGmLayer && isNarrator && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-purple-600 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white shadow">GM</span>
              )}
              {canMove && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeToken(t.id); }}
                  className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover:flex"
                  aria-label="Remove token"
                ><X className="h-3 w-3" /></button>
              )}
              {canMove && isSelected && (
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setResizeTokenId(t.id);
                    resizeOrigin.current = { mx: e.clientX, my: e.clientY, size: localSize[t.id] ?? t.size };
                  }}
                  className="absolute -bottom-1 -right-1 h-4 w-4 cursor-se-resize rounded-sm border-2 border-amber-400 bg-background shadow"
                  title="Drag to resize"
                />
              )}
            </div>
            <div className="pointer-events-none absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold shadow">
              {t.label}
            </div>
            {isSelected && onRoll && mode === "select" && (
              <div
                data-token-action-bar
                className="absolute left-1/2 top-full mt-6 -translate-x-1/2"
                onClick={(e) => e.stopPropagation()}
              >
                <TokenActionBar
                  kind={t.character_kind}
                  id={t.character_id}
                  label={t.label}
                  gameId={gameId}
                  userId={userId}
                  onRoll={onRoll}
                  onClose={() => setSelectedTokenId(null)}
                  onOpenSheet={() => onOpenSheet?.(t.character_kind, t.character_id, t.label)}
                  extra={isNarrator ? (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleTokenLayer(t.id, (t.layer ?? "tokens") as "tokens" | "gm")}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-semibold hover:bg-accent"
                        title="Mover entre camada visível e GM"
                      >
                        {onGmLayer ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        {onGmLayer ? "Tornar visível" : "Mover para GM"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTokenVision(t)}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-semibold hover:bg-accent"
                        title="Definir raio de visão deste token"
                      >
                        <Lightbulb className="h-3 w-3" />
                        Visão{(t.vision_radius ?? 0) > 0 ? `: ${t.vision_radius}` : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAppearanceToken({
                          id: t.id, label: t.label,
                          aura1_radius: t.aura1_radius, aura1_color: t.aura1_color,
                          aura2_radius: t.aura2_radius, aura2_color: t.aura2_color,
                          tint_color: t.tint_color,
                          bar_label: t.bar_label, bar_value: t.bar_value, bar_max: t.bar_max,
                          bar_color: t.bar_color,
                        })}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-semibold hover:bg-accent"
                        title="Auras, tinting e barra customizada"
                      >
                        <Palette className="h-3 w-3" />
                        Aparência
                      </button>
                    </>
                  ) : undefined}
                />
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
    </div>
    <TokenAppearanceDialog
      token={appearanceToken}
      open={!!appearanceToken}
      onOpenChange={(v) => { if (!v) setAppearanceToken(null); }}
    />
    </>
  );
}

function renderDrawing(
  d: Drawing,
  isPreview: boolean,
  isNarrator: boolean,
  userId: string,
  onDelete: (id: string) => void,
) {
  const sw = d.stroke_width;
  const stroke = d.stroke;
  const fill = d.fill ?? "none";
  const onGm = d.layer === "gm";
  const opacity = onGm ? 0.7 : 1;
  const dash = onGm ? "8 4" : undefined;
  const canDelete = !isPreview && (isNarrator || d.author_id === userId);
  const wrap = (children: React.ReactNode, cx: number, cy: number) => (
    <g key={d.id} opacity={opacity}>
      {children}
      {canDelete && (
        <g
          style={{ cursor: "pointer", pointerEvents: "auto" }}
          onClick={() => onDelete(d.id)}
        >
          <circle cx={cx} cy={cy} r={10} fill="hsl(0 84% 60%)" />
          <text x={cx} y={cy + 4} fontSize={12} textAnchor="middle" fill="white" fontWeight="bold">×</text>
        </g>
      )}
    </g>
  );

  if (d.kind === "freehand") {
    const pts = d.geometry.points ?? [];
    if (pts.length === 0) return null;
    const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x * 1000} ${y * 1000}`).join(" ");
    const last = pts[pts.length - 1];
    return wrap(
      <path d={path} stroke={stroke} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} vectorEffect="non-scaling-stroke" />,
      last[0] * 1000, last[1] * 1000,
    );
  }
  if (d.kind === "rect") {
    const x = (d.geometry.x ?? 0) * 1000;
    const y = (d.geometry.y ?? 0) * 1000;
    const w = (d.geometry.w ?? 0) * 1000;
    const h = (d.geometry.h ?? 0) * 1000;
    return wrap(
      <rect x={x} y={y} width={w} height={h} stroke={stroke} strokeWidth={sw} fill={fill} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />,
      x + w, y,
    );
  }
  if (d.kind === "circle") {
    const cx = (d.geometry.cx ?? 0) * 1000;
    const cy = (d.geometry.cy ?? 0) * 1000;
    const r = (d.geometry.r ?? 0) * 1000;
    return wrap(
      <circle cx={cx} cy={cy} r={r} stroke={stroke} strokeWidth={sw} fill={fill} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />,
      cx + r, cy,
    );
  }
  if (d.kind === "line") {
    const x1 = (d.geometry.x1 ?? 0) * 1000;
    const y1 = (d.geometry.y1 ?? 0) * 1000;
    const x2 = (d.geometry.x2 ?? 0) * 1000;
    const y2 = (d.geometry.y2 ?? 0) * 1000;
    return wrap(
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeDasharray={dash} vectorEffect="non-scaling-stroke" />,
      x2, y2,
    );
  }
  if (d.kind === "text") {
    const x = (d.geometry.x ?? 0) * 1000;
    const y = (d.geometry.y ?? 0) * 1000;
    const fs = d.geometry.fontSize ?? 16;
    return wrap(
      <text x={x} y={y} fontSize={fs * 2} fill={stroke} fontWeight="bold" strokeDasharray={dash}>{d.text_content}</text>,
      x + 40, y - 12,
    );
  }
  return null;
}

function MapToolbar({
  mode, setMode,
  drawTool, setDrawTool,
  drawColor, setDrawColor,
  drawWidth, setDrawWidth,
  drawLayer, setDrawLayer,
  isNarrator,
  showGMLayer, setShowGMLayer,
  onClearMine,
  isMobile,
  visibility,
  fogTool, setFogTool,
  onClearFog, onRevealAll, onClearWalls,
  onToggleFog, onToggleLighting,
  visEnabled, setVisEnabled,
  onAddBackground,
  onDeleteSelectedBg, onSendBgBack, onBringBgFront, selectedBgId,
}: {
  mode: Mode; setMode: (m: Mode) => void;
  drawTool: DrawKind; setDrawTool: (k: DrawKind) => void;
  drawColor: string; setDrawColor: (c: string) => void;
  drawWidth: number; setDrawWidth: (n: number) => void;
  drawLayer: "drawing" | "gm"; setDrawLayer: (l: "drawing" | "gm") => void;
  isNarrator: boolean;
  showGMLayer: boolean; setShowGMLayer: (b: boolean) => void;
  onClearMine: () => void;
  isMobile?: boolean;
  visibility: Visibility;
  fogTool: "reveal" | "hide"; setFogTool: (t: "reveal" | "hide") => void;
  onClearFog: () => void;
  onRevealAll: () => void;
  onClearWalls: () => void;
  onToggleFog: (v: boolean) => void;
  onToggleLighting: (v: boolean) => void;
  visEnabled: boolean; setVisEnabled: (b: boolean) => void;
  onAddBackground: (url: string) => void | Promise<void>;
  onDeleteSelectedBg?: () => void;
  onSendBgBack?: () => void;
  onBringBgFront?: () => void;
  selectedBgId: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const modeIcon = (m: Mode) => {
    switch (m) {
      case "select": return <MousePointer2 className="h-3.5 w-3.5" />;
      case "ruler": return <Ruler className="h-3.5 w-3.5" />;
      case "draw": return <Pencil className="h-3.5 w-3.5" />;
      case "fog": return <CloudFog className="h-3.5 w-3.5" />;
      case "walls": return <Box className="h-3.5 w-3.5" />;
      case "background": return <ImageIcon className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div
      data-map-toolbar
      className={`pointer-events-auto absolute left-3 top-16 z-30 flex flex-col gap-1.5 rounded-lg border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur transition-all ${collapsed ? "w-10 items-center" : "w-56"}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header / toggle */}
      <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-1 border-b border-border pb-1`}>
        {!collapsed && <span className="px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ferramentas</span>}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expandir ferramentas" : "Recolher ferramentas"}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-accent"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {collapsed ? (
        <div className="flex flex-col items-center gap-1">
          {(["select", "ruler", "draw", ...(isNarrator ? ["fog", "walls", "background"] : [])] as Mode[]).map((m) => (
            <ToolBtn key={m} active={mode === m} onClick={() => setMode(m)} title={modeTitle(m)}>
              {modeIcon(m)}
            </ToolBtn>
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            <ToolBtn active={mode === "select"} onClick={() => setMode("select")} title="Selecionar (clique e arraste tokens)"><MousePointer2 className="h-3.5 w-3.5" /></ToolBtn>
            <ToolBtn active={mode === "ruler"} onClick={() => setMode("ruler")} title="Régua (medir distância)"><Ruler className="h-3.5 w-3.5" /></ToolBtn>
            <ToolBtn active={mode === "draw"} onClick={() => setMode("draw")} title="Desenhar"><Pencil className="h-3.5 w-3.5" /></ToolBtn>
            {isNarrator && (
              <>
                <ToolBtn active={mode === "fog"} onClick={() => setMode("fog")} title="Fog of War (manual)"><CloudFog className="h-3.5 w-3.5" /></ToolBtn>
                <ToolBtn active={mode === "walls"} onClick={() => setMode("walls")} title="Paredes (bloqueiam visão)"><Box className="h-3.5 w-3.5" /></ToolBtn>
                <ToolBtn active={mode === "background"} onClick={() => setMode("background")} title="Backgrounds (mover/redimensionar/rotacionar imagens)"><ImageIcon className="h-3.5 w-3.5" /></ToolBtn>
              </>
            )}
          </div>
          {mode === "draw" && (
            <>
              <div className="flex flex-wrap gap-1 border-t border-border pt-1">
                <ToolBtn active={drawTool === "freehand"} onClick={() => setDrawTool("freehand")} title="Caneta livre"><Pencil className="h-3.5 w-3.5" /></ToolBtn>
                <ToolBtn active={drawTool === "rect"} onClick={() => setDrawTool("rect")} title="Retângulo"><Square className="h-3.5 w-3.5" /></ToolBtn>
                <ToolBtn active={drawTool === "circle"} onClick={() => setDrawTool("circle")} title="Círculo"><CircleIcon className="h-3.5 w-3.5" /></ToolBtn>
                <ToolBtn active={drawTool === "line"} onClick={() => setDrawTool("line")} title="Linha"><Minus className="h-3.5 w-3.5" /></ToolBtn>
                <ToolBtn active={drawTool === "text"} onClick={() => setDrawTool("text")} title="Texto"><TypeIcon className="h-3.5 w-3.5" /></ToolBtn>
              </div>
              <div className="flex items-center gap-1 border-t border-border pt-1">
                <input type="color" value={drawColor} onChange={(e) => setDrawColor(e.target.value)} className="h-6 w-7 cursor-pointer rounded border border-border bg-transparent" title="Cor" />
                <input
                  type="range" min={1} max={12} value={drawWidth}
                  onChange={(e) => setDrawWidth(Number(e.target.value))}
                  className="h-6 w-16" title={`Espessura: ${drawWidth}`}
                />
              </div>
              {isNarrator && (
                <div className="flex flex-wrap gap-1 border-t border-border pt-1">
                  <ToolBtn active={drawLayer === "drawing"} onClick={() => setDrawLayer("drawing")} title="Desenhar na camada visível">Visível</ToolBtn>
                  <ToolBtn active={drawLayer === "gm"} onClick={() => setDrawLayer("gm")} title="Desenhar só para o narrador">GM</ToolBtn>
                </div>
              )}
            </>
          )}
          {mode === "fog" && isNarrator && (
            <div className="flex flex-col gap-1 border-t border-border pt-1">
              <div className="flex flex-wrap gap-1">
                <ToolBtn active={fogTool === "reveal"} onClick={() => setFogTool("reveal")} title="Pincel: revelar área">Revelar</ToolBtn>
                <ToolBtn active={fogTool === "hide"} onClick={() => setFogTool("hide")} title="Pincel: ocultar área">Ocultar</ToolBtn>
              </div>
              <div className="flex flex-wrap gap-1">
                <ToolBtn onClick={onRevealAll} title="Revelar mapa inteiro">Tudo</ToolBtn>
                <ToolBtn onClick={onClearFog} title="Apagar toda a fog"><Trash2 className="h-3.5 w-3.5" /></ToolBtn>
              </div>
            </div>
          )}
          {mode === "walls" && isNarrator && (
            <div className="flex flex-col gap-1 border-t border-border pt-1">
              <p className="px-1 text-[10px] text-muted-foreground">Clique 2x para criar parede</p>
              <ToolBtn onClick={onClearWalls} title="Apagar todas as paredes"><Trash2 className="h-3.5 w-3.5" /></ToolBtn>
            </div>
          )}
          {mode === "background" && isNarrator && (
            <div className="flex flex-col gap-1 border-t border-border pt-1">
              <p className="px-1 text-[10px] text-muted-foreground">Clique numa imagem para mover/redimensionar/rotacionar</p>
              <BgUrlAdd onAdd={onAddBackground} />
              {selectedBgId && (
                <div className="flex flex-wrap gap-1">
                  {onBringBgFront && <ToolBtn onClick={onBringBgFront} title="Trazer para frente"><ArrowUp className="h-3.5 w-3.5" /></ToolBtn>}
                  {onSendBgBack && <ToolBtn onClick={onSendBgBack} title="Enviar para trás"><ArrowDown className="h-3.5 w-3.5" /></ToolBtn>}
                  {onDeleteSelectedBg && <ToolBtn onClick={onDeleteSelectedBg} title="Excluir background selecionado"><Trash2 className="h-3.5 w-3.5" /></ToolBtn>}
                </div>
              )}
            </div>
          )}
          {isNarrator && (
            <div className="flex flex-wrap gap-1 border-t border-border pt-1">
              <ToolBtn active={visibility.fogEnabled} onClick={() => onToggleFog(!visibility.fogEnabled)} title={visibility.fogEnabled ? "Desativar Fog of War" : "Ativar Fog of War"}>
                <CloudFog className="h-3.5 w-3.5" />
              </ToolBtn>
              <ToolBtn active={visibility.dynamicLighting} onClick={() => onToggleLighting(!visibility.dynamicLighting)} title={visibility.dynamicLighting ? "Desativar visão dinâmica" : "Ativar visão dinâmica"}>
                <Lightbulb className="h-3.5 w-3.5" />
              </ToolBtn>
              {(visibility.fogEnabled || visibility.dynamicLighting) && (
                <ToolBtn active={!visEnabled} onClick={() => setVisEnabled(!visEnabled)} title={visEnabled ? "Esconder fog localmente (narrador)" : "Mostrar fog"}>
                  {visEnabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </ToolBtn>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-1 border-t border-border pt-1">
            {isNarrator && (
              <ToolBtn active={!showGMLayer} onClick={() => setShowGMLayer(!showGMLayer)} title={showGMLayer ? "Esconder camada GM" : "Mostrar camada GM"}>
                {showGMLayer ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </ToolBtn>
            )}
            <ToolBtn onClick={onClearMine} title="Apagar meus desenhos"><Eraser className="h-3.5 w-3.5" /></ToolBtn>
          </div>
        </>
      )}
    </div>
  );
}

function modeTitle(m: Mode) {
  switch (m) {
    case "select": return "Selecionar";
    case "ruler": return "Régua";
    case "draw": return "Desenhar";
    case "fog": return "Fog of War";
    case "walls": return "Paredes";
    case "background": return "Backgrounds";
  }
}

function ToolBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex h-7 min-w-[28px] items-center justify-center gap-1 rounded px-1.5 text-[11px] font-semibold transition ${active ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
    >
      {children}
    </button>
  );
}

function BgUrlAdd({ onAdd }: { onAdd: (url: string) => void | Promise<void> }) {
  const [url, setUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  async function submitUrl() {
    const u = url.trim();
    if (!u) return;
    await onAdd(u);
    setUrl("");
  }
  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem"); return; }
    if (file.size > 5_000_000) { toast.error("Imagem muito grande (>5MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => { void onAdd(String(reader.result)); };
    reader.readAsDataURL(file);
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL da imagem"
          className="h-7 flex-1 rounded border border-input bg-background px-2 text-[11px]"
        />
        <button
          type="button"
          onClick={() => void submitUrl()}
          className="inline-flex h-7 items-center justify-center rounded bg-primary px-2 text-[11px] font-semibold text-primary-foreground hover:opacity-90"
          title="Adicionar"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex h-7 items-center justify-center gap-1 rounded border border-border bg-background px-2 text-[11px] font-semibold hover:bg-accent"
      >
        <ImageIcon className="h-3.5 w-3.5" /> Enviar arquivo
      </button>
    </div>
  );
}
