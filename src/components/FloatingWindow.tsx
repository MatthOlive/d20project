import { useRef, useState, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

let zCounter = 100;

export function FloatingWindow({
  title,
  onClose,
  children,
  initialX = 100,
  initialY = 80,
  width = 520,
  height,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  initialX?: number;
  initialY?: number;
  width?: number;
  height?: number;
}) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [z, setZ] = useState(() => ++zCounter);
  const dragOrigin = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragOrigin.current) return;
      setPos({
        x: dragOrigin.current.ox + e.clientX - dragOrigin.current.mx,
        y: Math.max(0, dragOrigin.current.oy + e.clientY - dragOrigin.current.my),
      });
    }
    function onUp() { dragOrigin.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  function bringFront() { setZ(++zCounter); }

  return (
    <div
      className="pointer-events-auto fixed flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      style={{ left: pos.x, top: pos.y, width, height, zIndex: z }}
      onMouseDown={bringFront}
    >
      <div
        className="flex h-9 cursor-move select-none items-center justify-between bg-pokedex px-3 text-pokedex-foreground"
        onMouseDown={(e) => {
          dragOrigin.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y };
        }}
      >
        <span className="text-sm font-bold">{title}</span>
        <button
          onClick={onClose}
          className="rounded p-1 transition hover:bg-white/15"
          aria-label="Close"
        ><X className="h-4 w-4" /></button>
      </div>
      <div className={cn("flex-1 overflow-auto bg-background")}>{children}</div>
    </div>
  );
}
