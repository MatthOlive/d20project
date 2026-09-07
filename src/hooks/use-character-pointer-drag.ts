import {
  createElement,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CHARACTER_POINTER_DROP_EVENT, type DragCharacterPayload } from "@/components/MapBoard";

export function useCharacterPointerDrag() {
  const dragRef = useRef<{
    payload: DragCharacterPayload;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [preview, setPreview] = useState<{ label: string; x: number; y: number } | null>(null);

  useEffect(() => {
    function update(clientX: number, clientY: number, pointerId: number) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== pointerId) return false;
      if (!drag.active && Math.hypot(clientX - drag.startX, clientY - drag.startY) > 6) drag.active = true;
      if (!drag.active) return false;
      setPreview({ label: drag.payload.label, x: clientX, y: clientY });
      return true;
    }

    function finish(clientX: number, clientY: number, pointerId: number) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== pointerId) return false;
      dragRef.current = null;
      setPreview(null);
      if (!drag.active) return false;
      suppressClickRef.current = true;
      window.dispatchEvent(new CustomEvent(CHARACTER_POINTER_DROP_EVENT, {
        cancelable: true,
        detail: { payload: drag.payload, clientX, clientY },
      }));
      return true;
    }

    function movePointer(event: PointerEvent) {
      if (update(event.clientX, event.clientY, event.pointerId)) event.preventDefault();
    }

    function finishPointer(event: PointerEvent) {
      if (finish(event.clientX, event.clientY, event.pointerId)) event.preventDefault();
    }

    function moveMouse(event: MouseEvent) {
      if (update(event.clientX, event.clientY, -1)) event.preventDefault();
    }

    function finishMouse(event: MouseEvent) {
      if (finish(event.clientX, event.clientY, -1)) event.preventDefault();
    }

    function cancel(event: PointerEvent) {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setPreview(null);
    }

    window.addEventListener("pointermove", movePointer, { passive: false });
    window.addEventListener("pointerup", finishPointer, { passive: false });
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("mousemove", moveMouse, { passive: false });
    window.addEventListener("mouseup", finishMouse, { passive: false });
    return () => {
      window.removeEventListener("pointermove", movePointer);
      window.removeEventListener("pointerup", finishPointer);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("mousemove", moveMouse);
      window.removeEventListener("mouseup", finishMouse);
    };
  }, []);

  function start(payload: DragCharacterPayload, pointerId: number, clientX: number, clientY: number) {
    dragRef.current = { payload, pointerId, startX: clientX, startY: clientY, active: false };
  }

  function begin(event: ReactPointerEvent, payload: DragCharacterPayload) {
    if (event.button !== 0) return;
    start(payload, event.pointerId, event.clientX, event.clientY);
  }

  function beginMouse(event: ReactMouseEvent, payload: DragCharacterPayload) {
    if (event.button !== 0) return;
    start(payload, -1, event.clientX, event.clientY);
  }

  function consumeSuppressedClick() {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }

  return { begin, beginMouse, consumeSuppressedClick, preview };
}

export function CharacterDragPreview({ preview }: { preview: { label: string; x: number; y: number } | null }) {
  if (!preview) return null;
  return createElement("div", {
    className: "pointer-events-none fixed z-[200] rounded-md border border-primary bg-popover px-3 py-2 text-xs font-bold shadow-xl",
    style: { left: preview.x + 12, top: preview.y + 12 },
  }, preview.label);
}
