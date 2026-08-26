import { supabase } from "@/integrations/supabase/client";

const CACHE_DB_NAME = "d20-catalog-cache";
const CACHE_STORE_NAME = "paged-responses";
const STATIC_CATALOGS = new Set(["species", "moves", "abilities", "natures"]);
const inFlightRequests = new Map<string, Promise<unknown[]>>();

type CachedResponse<T> = {
  key: string;
  savedAt: number;
  rows: T[];
};

function cacheVersion() {
  return (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "dev";
}

function defaultCatalogCacheMs() {
  return cacheVersion() === "dev" ? 15 * 60 * 1_000 : 6 * 60 * 60 * 1_000;
}

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(CACHE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readCachedRows<T>(key: string, maxAgeMs: number): Promise<T[] | null> {
  if (maxAgeMs <= 0) return null;
  const db = await openCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const transaction = db.transaction(CACHE_STORE_NAME, "readonly");
    const request = transaction.objectStore(CACHE_STORE_NAME).get(key);
    request.onsuccess = () => {
      const cached = request.result as CachedResponse<T> | undefined;
      resolve(cached && Date.now() - cached.savedAt <= maxAgeMs ? cached.rows : null);
    };
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
}

async function writeCachedRows<T>(key: string, rows: T[]) {
  const db = await openCacheDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(CACHE_STORE_NAME, "readwrite");
    transaction.objectStore(CACHE_STORE_NAME).put({ key, rows, savedAt: Date.now() });
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
  });
}

/**
 * Fetch all rows from a Supabase table, bypassing the default 1000-row limit
 * by paging via `.range()`. Use for catalogs that may exceed 2000 entries
 * (species, moves, abilities).
 */
export async function fetchAllPaged<T = unknown>(
  table: string,
  select: string,
  opts?: {
    orderBy?: string;
    ascending?: boolean;
    pageSize?: number;
    cacheTimeMs?: number;
  },
): Promise<T[]> {
  const pageSize = opts?.pageSize ?? 1000;
  const orderBy = opts?.orderBy;
  const ascending = opts?.ascending ?? true;
  const maxAgeMs = opts?.cacheTimeMs ?? (STATIC_CATALOGS.has(table) ? defaultCatalogCacheMs() : 0);
  const key = JSON.stringify({ version: cacheVersion(), table, select, orderBy, ascending, pageSize });
  const cached = await readCachedRows<T>(key, maxAgeMs);
  if (cached) return cached;

  const currentRequest = inFlightRequests.get(key);
  if (currentRequest) return currentRequest as Promise<T[]>;

  const request = (async () => {
    const all: T[] = [];
    let from = 0;
    // Safety cap to prevent runaway loops.
    for (let i = 0; i < 50; i++) {
      let q = supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(table as any)
        .select(select)
        .range(from, from + pageSize - 1);
      if (orderBy) q = q.order(orderBy, { ascending });
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as T[];
      all.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    if (maxAgeMs > 0) await writeCachedRows(key, all);
    return all;
  })();
  inFlightRequests.set(key, request as Promise<unknown[]>);
  try {
    return await request;
  } finally {
    inFlightRequests.delete(key);
  }
}
