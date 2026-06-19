import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  X, MousePointer2, Ruler, Pencil, Square, Circle as CircleIcon,
  Minus, Type as TypeIcon, Eraser, Eye, EyeOff,
} from "lucide-react";
import { TokenActionBar } from "@/components/TokenActionBar";
import { TokenStatsBar } from "@/components/TokenStatsBar";
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

type Mode = "select" | "ruler" | "draw" | "fog" | "walls";

type FogRegion = { id: string; game_id: string; x: number; y: number; w: number; h: number; revealed: boolean; author_id: string };
type Wall = { id: string; game_id: string; x1: number; y1: number; x2: number; y2: number };

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
  const [bgAspect, setBgAspect] = useState<number | null>(null);
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
  }, [resizeTokenId, localSize, mode]);


  useEffect(() => {
    if (!backgroundUrl) { setBgAspect(null); return; }
    const img = new Image();
    img.onload = () => setBgAspect(img.naturalWidth / img.naturalHeight);
    img.src = backgroundUrl;
  }, [backgroundUrl]);

  const { data: tokensRaw = [] } = useQuery({
    queryKey: ["tokens", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tokens").select("*").eq("game_id", gameId);
      if (error) throw error;
      return (data ?? []) as Token[];
    },
  });
  const tokens = useMemo(
    () => tokensRaw.filter((t) => isNarrator || (t.layer ?? "tokens") !== "gm"),
    [tokensRaw, isNarrator],
  );

  useEffect(() => {
    const ch = supabase
      .channel(`tokens:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tokens", filter: `game_id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ["tokens", gameId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [gameId, qc]);

  // Drawings query + realtime
  const { data: drawings = [] } = useQuery({
    queryKey: ["map_drawings", gameId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("map_drawings" as never).select("*").eq("game_id", gameId) as unknown as Promise<{ data: Drawing[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return (data ?? []) as Drawing[];
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel(`drawings:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "map_drawings", filter: `game_id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ["map_drawings", gameId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [gameId, qc]);

  const visibleDrawings = useMemo(
    () => drawings.filter((d) => d.layer !== "gm" || (isNarrator && showGMLayer)),
    [drawings, isNarrator, showGMLayer],
  );

  // ───────────── Fog of War + Walls (Phase 2) ─────────────
  const [fogTool, setFogTool] = useState<"reveal" | "hide">("reveal");
  const [fogRect, setFogRect] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null);
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [wallCursor, setWallCursor] = useState<{ x: number; y: number } | null>(null);
  const [visEnabled, setVisEnabled] = useState(true);
  const fogActive = visibility.fogEnabled || visibility.dynamicLighting;

  const { data: fogRegions = [] } = useQuery({
    queryKey: ["fog_regions", gameId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("fog_regions" as never).select("*").eq("game_id", gameId) as unknown as Promise<{ data: FogRegion[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return (data ?? []) as FogRegion[];
    },
  });
  const { data: walls = [] } = useQuery({
    queryKey: ["walls", gameId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("walls" as never).select("*").eq("game_id", gameId) as unknown as Promise<{ data: Wall[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return (data ?? []) as Wall[];
    },
  });
  useEffect(() => {
    const ch1 = supabase.channel(`fog:${gameId}`).on("postgres_changes",
      { event: "*", schema: "public", table: "fog_regions", filter: `game_id=eq.${gameId}` },
      () => qc.invalidateQueries({ queryKey: ["fog_regions", gameId] })).subscribe();
    const ch2 = supabase.channel(`walls:${gameId}`).on("postgres_changes",
      { event: "*", schema: "public", table: "walls", filter: `game_id=eq.${gameId}` },
      () => qc.invalidateQueries({ queryKey: ["walls", gameId] })).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [gameId, qc]);

  async function insertFogRegion(ax: number, ay: number, bx: number, by: number, revealed: boolean) {
    const x = Math.min(ax, bx), y = Math.min(ay, by);
    const w = Math.abs(bx - ax), h = Math.abs(by - ay);
    if (w < 0.005 || h < 0.005) return;
    const { error } = await (supabase.from("fog_regions" as never).insert({ game_id: gameId, x, y, w, h, revealed, author_id: userId } as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function clearFog() {
    if (!confirm("Apagar toda a fog desta mesa?")) return;
    const { error } = await (supabase.from("fog_regions" as never).delete().eq("game_id", gameId) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function revealAll() {
    const { error } = await (supabase.from("fog_regions" as never).insert({ game_id: gameId, x: 0, y: 0, w: 1, h: 1, revealed: true, author_id: userId } as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function insertWall(x1: number, y1: number, x2: number, y2: number) {
    if (Math.hypot(x2 - x1, y2 - y1) < 0.01) return;
    const { error } = await (supabase.from("walls" as never).insert({ game_id: gameId, x1, y1, x2, y2, author_id: userId } as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function deleteWall(id: string) {
    const { error } = await (supabase.from("walls" as never).delete().eq("id", id) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) toast.error(error.message);
  }
  async function clearWalls() {
    if (!confirm("Apagar todas as paredes?")) return;
    const { error } = await (supabase.from("walls" as never).delete().eq("game_id", gameId) as unknown as Promise<{ error: { message: string } | null }>);
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
      : tokens.filter((t) => t.owner_id === userId && (t.vision_radius ?? 0) > 0);
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
      className={`relative overflow-hidden rounded-xl border border-border bg-muted ${bgAspect ? "max-h-full max-w-full" : "h-full w-full"}`}
      style={{
        ...(bgAspect ? { aspectRatio: String(bgAspect), height: "100%", width: "auto" } : {}),
        cursor: mode === "ruler" ? "crosshair" : mode === "draw" ? "crosshair" : undefined,
      }}
    >
      {topLeftSlot && <div className="absolute left-3 top-3 z-30 flex items-center gap-2">{topLeftSlot}</div>}

      {/* Map toolbar (top-right) */}
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
        const canMove = isNarrator || t.owner_id === userId;
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
            <div className={`relative flex h-full w-full items-center justify-center rounded-full border-2 ${isSelected ? "border-amber-400 ring-2 ring-amber-400/50" : onGmLayer ? "border-purple-500 ring-2 ring-purple-500/40 border-dashed" : "border-primary ring-2 ring-background"} bg-card shadow-md`}>
              {t.image_url ? (
                <img src={t.image_url} alt={t.label} className="h-full w-full rounded-full object-cover" draggable={false} />
              ) : (
                <span className="text-xs font-bold">{t.label.slice(0, 2).toUpperCase()}</span>
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
                    <button
                      type="button"
                      onClick={() => toggleTokenLayer(t.id, (t.layer ?? "tokens") as "tokens" | "gm")}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-semibold hover:bg-accent"
                      title="Mover entre camada visível e GM"
                    >
                      {onGmLayer ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      {onGmLayer ? "Tornar visível" : "Mover para GM"}
                    </button>
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
}) {
  return (
    <div
      data-map-toolbar
      className={`pointer-events-auto absolute z-30 flex flex-col gap-1 rounded-lg border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur ${isMobile ? "left-1/2 bottom-3 -translate-x-1/2" : "right-3 top-3"}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex gap-1">
        <ToolBtn active={mode === "select"} onClick={() => setMode("select")} title="Selecionar (clique e arraste tokens)"><MousePointer2 className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn active={mode === "ruler"} onClick={() => setMode("ruler")} title="Régua (medir distância)"><Ruler className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn active={mode === "draw"} onClick={() => setMode("draw")} title="Desenhar"><Pencil className="h-3.5 w-3.5" /></ToolBtn>
      </div>
      {mode === "draw" && (
        <>
          <div className="flex gap-1 border-t border-border pt-1">
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
            <div className="flex gap-1 border-t border-border pt-1">
              <ToolBtn active={drawLayer === "drawing"} onClick={() => setDrawLayer("drawing")} title="Desenhar na camada visível">Visível</ToolBtn>
              <ToolBtn active={drawLayer === "gm"} onClick={() => setDrawLayer("gm")} title="Desenhar só para o narrador">GM</ToolBtn>
            </div>
          )}
        </>
      )}
      <div className="flex gap-1 border-t border-border pt-1">
        {isNarrator && (
          <ToolBtn active={!showGMLayer} onClick={() => setShowGMLayer(!showGMLayer)} title={showGMLayer ? "Esconder camada GM" : "Mostrar camada GM"}>
            {showGMLayer ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </ToolBtn>
        )}
        <ToolBtn onClick={onClearMine} title="Apagar meus desenhos"><Eraser className="h-3.5 w-3.5" /></ToolBtn>
      </div>
    </div>
  );
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
