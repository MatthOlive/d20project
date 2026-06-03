import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X } from "lucide-react";
import { TokenActionBar } from "@/components/TokenActionBar";
import { TokenStatsBar } from "@/components/TokenStatsBar";

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
};

const GRID_PX = 56;

export function MapBoard({
  gameId,
  backgroundUrl,
  userId,
  isNarrator,
  topLeftSlot,
  onRoll,
  onOpenSheet,
}: {
  gameId: string;
  backgroundUrl: string | null;
  userId: string;
  isNarrator: boolean;
  topLeftSlot?: React.ReactNode;
  onRoll?: (label: string, n: number, penalty?: number, meta?: { characterKind: "trainer" | "pokemon"; characterId: string; imageUrl?: string | null }) => void;
  onOpenSheet?: (kind: "trainer" | "pokemon", id: string, label: string) => void;
}) {
  const qc = useQueryClient();
  const boardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [hoverTokenId, setHoverTokenId] = useState<string | null>(null);
  const [bgAspect, setBgAspect] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panOrigin = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (panOrigin.current) {
        setPan({
          x: panOrigin.current.ox + e.clientX - panOrigin.current.mx,
          y: panOrigin.current.oy + e.clientY - panOrigin.current.my,
        });
      }
    }
    function onUp() { panOrigin.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);


  useEffect(() => {
    if (!backgroundUrl) { setBgAspect(null); return; }
    const img = new Image();
    img.onload = () => setBgAspect(img.naturalWidth / img.naturalHeight);
    img.src = backgroundUrl;
  }, [backgroundUrl]);

  const { data: tokens = [] } = useQuery({
    queryKey: ["tokens", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tokens").select("*").eq("game_id", gameId);
      if (error) throw error;
      return (data ?? []) as Token[];
    },
  });

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

  function snap(v: number, dim: number) {
    const px = v * dim;
    const cell = Math.round(px / GRID_PX) * GRID_PX;
    return Math.max(0, Math.min(1, cell / dim));
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
    if (e.button === 2) {
      e.preventDefault();
      panOrigin.current = { mx: e.clientX, my: e.clientY, ox: pan.x, oy: pan.y };
    }
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

  return (
    <div className="flex h-full w-full items-center justify-center">
    <div
      ref={boardRef}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDrop={onDrop}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
      onMouseDown={onMouseDown}
      className={`relative overflow-hidden rounded-xl border border-border bg-muted ${bgAspect ? "max-h-full max-w-full" : "h-full w-full"}`}
      style={{
        ...(bgAspect ? { aspectRatio: String(bgAspect), height: "100%", width: "auto" } : {}),
      }}
    >
      {topLeftSlot && <div className="absolute left-3 top-3 z-30 flex items-center gap-2">{topLeftSlot}</div>}
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
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(0,0,0,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.25) 1px, transparent 1px)",
          backgroundSize: `${GRID_PX}px ${GRID_PX}px`,
        }}
      />


      {tokens.map((t) => {
        const canMove = isNarrator || t.owner_id === userId;
        const isSelected = selectedTokenId === t.id;
        const isHover = hoverTokenId === t.id;
        const showStats = isSelected || isHover;
        return (
          <div
            key={t.id}
            draggable={canMove}
            onDragStart={(e) => {
              if (!canMove) return;
              setDragId(t.id);
              e.dataTransfer.effectAllowed = "move";
              const img = new Image();
              e.dataTransfer.setDragImage(img, 0, 0);
            }}
            onMouseEnter={() => setHoverTokenId(t.id)}
            onMouseLeave={() => setHoverTokenId((cur) => (cur === t.id ? null : cur))}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedTokenId((cur) => (cur === t.id ? null : t.id));
            }}
            className="group absolute -translate-x-1/2 -translate-y-1/2 select-none"
            style={{
              left: `${t.x * 100}%`,
              top: `${t.y * 100}%`,
              width: t.size,
              height: t.size,
              cursor: canMove ? "grab" : "pointer",
              zIndex: isSelected || isHover ? 20 : 1,
            }}
            title={t.label}
          >
            {showStats && (
              <div className="pointer-events-none absolute left-1/2 -top-2 -translate-x-1/2 -translate-y-full">
                <TokenStatsBar
                  kind={t.character_kind}
                  id={t.character_id}
                  editable={canMove}
                  expanded={isSelected}
                />
              </div>
            )}
            <div className={`relative flex h-full w-full items-center justify-center rounded-full border-2 ${isSelected ? "border-amber-400 ring-2 ring-amber-400/50" : "border-primary ring-2 ring-background"} bg-card shadow-md`}>
              {t.image_url ? (
                <img src={t.image_url} alt={t.label} className="h-full w-full rounded-full object-cover" draggable={false} />
              ) : (
                <span className="text-xs font-bold">{t.label.slice(0, 2).toUpperCase()}</span>
              )}
              {canMove && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeToken(t.id); }}
                  className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover:flex"
                  aria-label="Remove token"
                ><X className="h-3 w-3" /></button>
              )}
            </div>
            <div className="pointer-events-none absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold shadow">
              {t.label}
            </div>
            {isSelected && onRoll && (
              <div
                className="absolute left-1/2 top-full mt-6 -translate-x-1/2"
                onClick={(e) => e.stopPropagation()}
              >
                <TokenActionBar
                  kind={t.character_kind}
                  id={t.character_id}
                  label={t.label}
                  onRoll={onRoll}
                  onClose={() => setSelectedTokenId(null)}
                  onOpenSheet={() => onOpenSheet?.(t.character_kind, t.character_id, t.label)}
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

