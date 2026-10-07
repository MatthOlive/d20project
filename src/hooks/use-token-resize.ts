import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

export function useTokenResize({ zoom, preview, finish, cancel }: {
  zoom: number; preview: (id: string, size: number) => void;
  finish: (id: string, size: number) => void; cancel: (id: string) => void;
}) {
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);
  return function begin(event: ReactPointerEvent<HTMLElement>, id: string, initialSize: number) {
    event.preventDefault(); event.stopPropagation();
    if (event.button !== 0) return;
    cleanupRef.current?.();
    const pointerId = event.pointerId, touch = event.pointerType !== "mouse";
    const startX = event.clientX, startY = event.clientY;
    let active = !touch, moved = false, size = initialSize;
    const target = event.currentTarget;
    target.setPointerCapture?.(pointerId);
    if (active) preview(id, size);
    const timer = touch ? setTimeout(() => { active = true; preview(id, size); navigator.vibrate?.(20); }, 450) : null;
    function cleanup() {
      if (timer) clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", abort);
      if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
      cleanupRef.current = null;
    }
    function move(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!active) { if (Math.hypot(dx, dy) > 8) { cleanup(); cancel(id); } return; }
      e.preventDefault();
      const delta = touch ? -dy : Math.abs(dx) > Math.abs(dy) ? dx : dy;
      size = Math.max(24, Math.min(240, Math.round(initialSize + delta / zoom)));
      moved = size !== initialSize; preview(id, size);
    }
    function up(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      cleanup();
      if (active && moved) finish(id, size); else cancel(id);
    }
    function abort(e: PointerEvent) { if (e.pointerId === pointerId) { cleanup(); cancel(id); } }
    cleanupRef.current = () => { cleanup(); cancel(id); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", abort);
  };
}
