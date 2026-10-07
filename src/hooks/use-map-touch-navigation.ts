import { useEffect, useRef, useState, type TouchEvent } from "react";

type Point = { x: number; y: number };
type Gesture = { kind: "waiting" | "pan"; id: number; start: Point; pan: Point }
  | { kind: "zoom"; y: number; zoom: number; pan: Point; anchor: Point };
const blockedTarget = "[data-map-token], [data-token-action-bar], [data-map-toolbar], button, input, select, textarea, a";

export function useMapTouchNavigation({ pan, zoom, setPan, setZoom, enabled }: {
  pan: Point; zoom: number; setPan: (value: Point) => void; setZoom: (value: number) => void; enabled: boolean;
}) {
  const gesture = useRef<Gesture | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressMouseUntil = useRef(0);
  const [panning, setPanning] = useState(false);
  function clearTimer() { if (timer.current) clearTimeout(timer.current); timer.current = null; }
  function reset() { clearTimer(); gesture.current = null; setPanning(false); }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; gesture.current = null; setPanning(false);
  }, [enabled]);

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (!enabled) return;
    suppressMouseUntil.current = Date.now() + 800;
    if (event.touches.length > 1) reset();
    if ((event.target as Element).closest(blockedTarget)) return;
    if (event.touches.length === 2) {
      const [a, b] = Array.from(event.touches);
      if ([a, b].some((touch) => document.elementFromPoint(touch.clientX, touch.clientY)?.closest(blockedTarget))) return;
      event.preventDefault(); clearTimer(); setPanning(false);
      const rect = event.currentTarget.getBoundingClientRect();
      gesture.current = { kind: "zoom", y: (a.clientY + b.clientY) / 2, zoom, pan,
        anchor: { x: (a.clientX + b.clientX) / 2 - rect.left - rect.width / 2,
          y: (a.clientY + b.clientY) / 2 - rect.top - rect.height / 2 } };
    } else if (event.touches.length === 1) {
      const touch = event.touches[0]; clearTimer();
      const next: Gesture = { kind: "waiting", id: touch.identifier, start: { x: touch.clientX, y: touch.clientY }, pan };
      gesture.current = next;
      timer.current = setTimeout(() => {
        if (gesture.current !== next) return;
        next.kind = "pan"; setPanning(true);
        navigator.vibrate?.(20);
      }, 450);
    } else reset();
  }
  function onTouchMove(event: TouchEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current) return;
    if (current.kind === "zoom" && event.touches.length === 2) {
      event.preventDefault();
      const y = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      const nextZoom = Math.max(0.3, Math.min(4, current.zoom * Math.exp((y - current.y) / 240)));
      const ratio = nextZoom / current.zoom;
      setZoom(nextZoom);
      setPan({ x: current.anchor.x - (current.anchor.x - current.pan.x) * ratio,
        y: current.anchor.y - (current.anchor.y - current.pan.y) * ratio });
      return;
    }
    if (current.kind === "zoom" || event.touches.length !== 1) return;
    const touch = Array.from(event.touches).find((item) => item.identifier === current.id);
    if (!touch) return;
    const dx = touch.clientX - current.start.x, dy = touch.clientY - current.start.y;
    if (current.kind === "waiting") { if (Math.hypot(dx, dy) > 8) reset(); return; }
    event.preventDefault();
    setPan({ x: current.pan.x + dx, y: current.pan.y + dy });
  }
  function onTouchEnd() { suppressMouseUntil.current = Date.now() + 800; reset(); }
  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd, panning,
    suppressMouse: () => Date.now() < suppressMouseUntil.current };
}
