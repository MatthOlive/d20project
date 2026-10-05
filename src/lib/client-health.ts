import type { DebouncedSaveState } from "@/lib/use-debounced-patch";

export type ClientHealthSnapshot = {
  pendingSaves: number;
  saveErrors: number;
  realtimeErrors: number;
};

type RealtimeStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED" | string;
type Listener = (snapshot: ClientHealthSnapshot) => void;

export const RETRY_PENDING_SAVES_EVENT = "d20:retry-pending-saves";

const saves = new Map<string, DebouncedSaveState>();
const realtime = new Map<string, RealtimeStatus>();
const listeners = new Set<Listener>();

function storedPendingSaveCount() {
  if (typeof window === "undefined") return 0;
  let count = 0;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || (!key.startsWith("d20:pending:") && !key.startsWith("d20:pending-patch:"))) {
        continue;
      }
      const value = JSON.parse(window.localStorage.getItem(key) ?? "null") as unknown;
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length > 0
      ) {
        count += 1;
      }
    }
  } catch {
    // The active in-memory state still provides a useful status.
  }
  return count;
}

function snapshot(): ClientHealthSnapshot {
  const activePending = [...saves.values()].filter(
    (state) => state === "pending" || state === "saving",
  ).length;
  const saveErrors = [...saves.values()].filter((state) => state === "error").length;
  const realtimeErrors = [...realtime.values()].filter(
    (status) => status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED",
  ).length;
  return {
    pendingSaves: Math.max(activePending + saveErrors, storedPendingSaveCount()),
    saveErrors,
    realtimeErrors,
  };
}

function notify() {
  const next = snapshot();
  for (const listener of listeners) listener(next);
}

export function reportSaveStatus(key: string, state: DebouncedSaveState) {
  if (state === "idle" || state === "saved") saves.delete(key);
  else saves.set(key, state);
  notify();
}

export function clearSaveStatus(key: string) {
  saves.delete(key);
  notify();
}

export function reportPendingStorageChanged() {
  notify();
}

export function reportRealtimeStatus(key: string, status: RealtimeStatus) {
  realtime.set(key, status);
  notify();
}

export function clearRealtimeStatus(key: string) {
  realtime.delete(key);
  notify();
}

export function retryPendingSaves() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RETRY_PENDING_SAVES_EVENT));
}

export function subscribeClientHealth(listener: Listener) {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}
