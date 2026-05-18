import { useCallback, useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

// Optimistic local update + debounced server commit.
// Keeps the UI snappy when users type or drag dots in a character sheet.
export function useDebouncedPatch<T extends object>(
  queryKey: QueryKey,
  commit: (patch: Partial<T>) => Promise<void> | void,
  delay = 400,
) {
  const qc = useQueryClient();
  const pending = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const data = pending.current;
    pending.current = {};
    if (Object.keys(data).length > 0) await commit(data);
  }, [commit]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const patch = useCallback((p: Partial<T>) => {
    qc.setQueryData(queryKey, (old: T | undefined) => (old ? { ...old, ...p } : old));
    pending.current = { ...pending.current, ...p };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, delay);
  }, [qc, queryKey, delay, flush]);

  return { patch, flush };
}
