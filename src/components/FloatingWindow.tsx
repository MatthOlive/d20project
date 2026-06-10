import { useRef, useState, useEffect, type ReactNode } from "react";
import { X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

// Keep windows below shadcn dialogs/popovers (z-50) so move-pickers stay on top.
let zCounter = 10;

export function FloatingWindow({
  title,
  onClose,
  onPopOut,
  children,
  initialX = 100,
  initialY = 80,
  width = 520,
  height = 600,
  minWidth = 320,
  minHeight = 240,
}: {
  title: string;
  onClose: () => void;
  onPopOut?: () => void;
  children: ReactNode;
  initialX?: number;
  initialY?: number;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
}) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [size, setSize] = useState({ w: width, h: height });
  const [minimized, setMinimized] = useState(false);
  const nextZ = () => {
    zCounter = zCounter >= 45 ? 10 : zCounter + 1;
    return zCounter;
  };
  const [z, setZ] = useState(() => nextZ());
  const dragOrigin = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const resizeOrigin = useRef<{ mx: number; my: number; ow: number; oh: number } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (dragOrigin.current) {
        setPos({
          x: dragOrigin.current.ox + e.clientX - dragOrigin.current.mx,
          y: Math.max(0, dragOrigin.current.oy + e.clientY - dragOrigin.current.my),
        });
      }
      if (resizeOrigin.current) {
        setSize({
          w: Math.max(minWidth, resizeOrigin.current.ow + e.clientX - resizeOrigin.current.mx),
          h: Math.max(minHeight, resizeOrigin.current.oh + e.clientY - resizeOrigin.current.my),
        });
      }
    }
    function onUp() { dragOrigin.current = null; resizeOrigin.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [minWidth, minHeight]);

  function bringFront() { setZ(nextZ()); }

  return (
    <div
      className={cn(
        "pointer-events-auto fixed flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl transition-opacity",
        minimized && "opacity-50 hover:opacity-100",
      )}
      style={{
        left: pos.x,
        top: pos.y,
        width: minimized ? "auto" : size.w,
        height: minimized ? 28 : size.h,
        zIndex: z,
      }}
      onMouseDown={bringFront}
    >
      <div
        className={cn(
          "flex cursor-move select-none items-center justify-between bg-pokedex text-pokedex-foreground",
          minimized ? "h-7 gap-2 px-2" : "h-9 px-3",
        )}
        onMouseDown={(e) => {
          dragOrigin.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y };
        }}
        onDoubleClick={() => setMinimized((v) => !v)}
        title="Double-click to minimize / restore"
      >
        <span className={cn("font-bold", minimized ? "text-xs" : "text-sm")}>{title}</span>
        <div className="flex items-center gap-1">
          {onPopOut && !minimized && (
            <button
              onClick={(e) => { e.stopPropagation(); onPopOut(); }}
              className="rounded p-1 transition hover:bg-white/15"
              aria-label="Open in new window"
              title="Open in new window"
            ><ExternalLink className="h-3.5 w-3.5" /></button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setMinimized((v) => !v); }}
            className="rounded p-1 transition hover:bg-white/15"
            aria-label={minimized ? "Restore" : "Minimize"}
          >
            <span className="block h-0.5 w-3 bg-current" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 transition hover:bg-white/15"
            aria-label="Close"
          ><X className={minimized ? "h-3 w-3" : "h-4 w-4"} /></button>
        </div>
      </div>
      {!minimized && (
        <>
          <div className={cn("flex-1 overflow-auto bg-background")}>{children}</div>
          <div
            className="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-se-resize"
            onMouseDown={(e) => {
              e.stopPropagation();
              resizeOrigin.current = { mx: e.clientX, my: e.clientY, ow: size.w, oh: size.h };
            }}
            style={{
              background:
                "linear-gradient(135deg, transparent 0 50%, hsl(var(--muted-foreground) / 0.5) 50% 60%, transparent 60% 70%, hsl(var(--muted-foreground) / 0.5) 70% 80%, transparent 80%)",
            }}
            aria-label="Resize"
          />
        </>
      )}
    </div>
  );
}
