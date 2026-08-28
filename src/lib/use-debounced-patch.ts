import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { readLocalGameSnapshot, writeLocalGameSnapshot } from "@/lib/local-game-cache";
import { recordClientDiagnostic } from "@/lib/client-diagnostics";
import { mergeServerWithPending } from "@/lib/multiplayer-sync";
import {
  clearSaveStatus,
  reportPendingStorageChanged,
  reportSaveStatus,
  RETRY_PENDING_SAVES_EVENT,
} from "@/lib/client-health";

export type DebouncedSaveState = "idle" | "pending" | "saving" | "saved" | "error";

type DebouncedPatchOptions = {
  storageKey?: string;
  snapshotKey?: string;
  maxAutomaticRetries?: number;
  retryDelay?: number;
  periodicFlushMs?: number;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível salvar as alterações.";
}

function readStoredPatch<T extends object>(key: string): Partial<T> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Partial<T> : {};
  } catch {
    return {};
  }
}

// Optimistic local update + debounced server commit. Pending changes survive reloads
// and temporary connection failures until the server confirms the write.
export function useDebouncedPatch<T extends object>(
  queryKey: QueryKey,
  commit: (patch: Partial<T>) => Promise<void> | void,
  delay = 400,
  options: DebouncedPatchOptions = {},
) {
  const qc = useQueryClient();
  const generatedStorageKey = useMemo(
    () => `d20:pending-patch:${JSON.stringify(queryKey)}`,
    [queryKey],
  );
  const storageKey = options.storageKey ?? generatedStorageKey;
  const maxAutomaticRetries = options.maxAutomaticRetries ?? 2;
  const retryDelay = options.retryDelay ?? 1_500;
  const periodicFlushMs = options.periodicFlushMs ?? 30_000;
  const pending = useRef<Partial<T>>({});
  const inFlightPatch = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const retryCount = useRef(0);
  const mounted = useRef(true);
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const [saveState, setSaveState] = useState<DebouncedSaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const persistPending = useCallback((data: Partial<T>) => {
    if (typeof window === "undefined") return;
    try {
      if (Object.keys(data).length === 0) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, JSON.stringify(data));
      reportPendingStorageChanged();
    } catch {
      // The server save still works when local storage is unavailable.
    }
  }, [storageKey]);

  const persistAllPending = useCallback(() => {
    persistPending({ ...inFlightPatch.current, ...pending.current });
  }, [persistPending]);

  const persistSnapshot = useCallback(() => {
    if (!options.snapshotKey) return;
    const current = qc.getQueryData<T>(queryKey);
    if (current) void writeLocalGameSnapshot(options.snapshotKey, current);
  }, [options.snapshotKey, qc, queryKey]);

  const scheduleSnapshot = useCallback(() => {
    if (!options.snapshotKey) return;
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    snapshotTimer.current = setTimeout(persistSnapshot, 250);
  }, [options.snapshotKey, persistSnapshot]);

  const scheduleFlush = useCallback((wait: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flushRef.current().catch(() => undefined);
    }, wait);
  }, []);

  const flush = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const data = pending.current;
    if (Object.keys(data).length === 0) return;
    pending.current = {};
    inFlightPatch.current = data;
    persistAllPending();
    if (mounted.current) {
      setSaveState("saving");
      setSaveError(null);
    }

    let succeeded = false;
    const request = (async () => {
      try {
        await commit(data);
        succeeded = true;
        retryCount.current = 0;
        persistSnapshot();
        if (mounted.current) setSaveState("saved");
      } catch (error) {
        pending.current = { ...data, ...pending.current };
        inFlightPatch.current = {};
        persistAllPending();
        const message = errorMessage(error);
        recordClientDiagnostic("autosave", error, { storageKey });
        if (mounted.current) {
          setSaveState("error");
          setSaveError(message);
        }
        if (retryCount.current < maxAutomaticRetries) {
          retryCount.current += 1;
          scheduleFlush(retryDelay * retryCount.current);
        }
        throw error;
      } finally {
        inFlightPatch.current = {};
        persistAllPending();
        inFlight.current = null;
        if (succeeded && Object.keys(pending.current).length > 0) scheduleFlush(delay);
      }
    })();
    inFlight.current = request;
    return request;
  }, [commit, delay, maxAutomaticRetries, persistAllPending, persistSnapshot, retryDelay, scheduleFlush, storageKey]);
  flushRef.current = flush;

  useEffect(() => {
    reportSaveStatus(storageKey, saveState);
  }, [saveState, storageKey]);

  const patch = useCallback((next: Partial<T>) => {
    qc.setQueryData(queryKey, (old: T | undefined) => (old ? { ...old, ...next } : old));
    pending.current = { ...pending.current, ...next };
    retryCount.current = 0;
    persistAllPending();
    scheduleSnapshot();
    setSaveState("pending");
    setSaveError(null);
    scheduleFlush(delay);
  }, [delay, persistAllPending, qc, queryKey, scheduleFlush, scheduleSnapshot]);

  const mergeServerPatch = useCallback((serverPatch: Partial<T>) => {
    qc.setQueryData<T>(queryKey, (current) =>
      mergeServerWithPending(current, serverPatch, inFlightPatch.current, pending.current),
    );
    scheduleSnapshot();
  }, [qc, queryKey, scheduleSnapshot]);

  const retry = useCallback(async () => {
    retryCount.current = 0;
    if (Object.keys(pending.current).length === 0) return;
    setSaveState("pending");
    setSaveError(null);
    return flushRef.current();
  }, []);

  useEffect(() => {
    mounted.current = true;
    const recovered = readStoredPatch<T>(storageKey);
    if (Object.keys(recovered).length > 0) {
      pending.current = { ...recovered, ...pending.current };
      qc.setQueryData(queryKey, (old: T | undefined) => old ? { ...old, ...recovered } : old);
      setSaveState("pending");
      scheduleFlush(delay);
    }

    if (options.snapshotKey) {
      void readLocalGameSnapshot<T>(options.snapshotKey).then((snapshot) => {
        if (!mounted.current || !snapshot) return;
        qc.setQueryData<T>(queryKey, (current) => current ?? { ...snapshot.data, ...pending.current });
      });
    }

    const handleOnline = () => {
      if (Object.keys(pending.current).length > 0) void retry().catch(() => undefined);
    };
    const handleManualRetry = () => {
      if (Object.keys(pending.current).length > 0) void retry().catch(() => undefined);
    };
    const handleBeforeUnload = () => persistAllPending();
    const handlePageHide = () => {
      persistAllPending();
      persistSnapshot();
      void flushRef.current().catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") handlePageHide();
    };
    const periodicFlush = window.setInterval(() => {
      if (Object.keys(pending.current).length > 0 && navigator.onLine !== false) {
        retryCount.current = 0;
        void flushRef.current().catch(() => undefined);
      }
      persistSnapshot();
    }, periodicFlushMs);
    window.addEventListener("online", handleOnline);
    window.addEventListener(RETRY_PENDING_SAVES_EVENT, handleManualRetry);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
      window.clearInterval(periodicFlush);
      persistAllPending();
      persistSnapshot();
      void flushRef.current().catch(() => undefined);
      clearSaveStatus(storageKey);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(RETRY_PENDING_SAVES_EVENT, handleManualRetry);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [delay, options.snapshotKey, periodicFlushMs, persistAllPending, persistSnapshot, qc, queryKey, retry, scheduleFlush, storageKey]);

  return { patch, flush, retry, mergeServerPatch, saveState, saveError };
}
