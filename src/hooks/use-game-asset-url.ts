import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { gameAssetPath } from "@/lib/game-assets";

type CachedAsset = {
  url: string | null;
  pending: Promise<string | null>;
  references: number;
  cleanup: number | null;
};

const assetCache = new Map<string, CachedAsset>();
const IDLE_CACHE_MS = 60_000;
let cacheGeneration = 0;

function discardAsset(path: string, entry: CachedAsset) {
  if (entry.cleanup !== null) window.clearTimeout(entry.cleanup);
  if (entry.url) URL.revokeObjectURL(entry.url);
  assetCache.delete(path);
}

function acquireAsset(path: string) {
  let entry = assetCache.get(path);
  if (!entry) {
    const generation = cacheGeneration;
    const created: CachedAsset = {
      url: null,
      pending: Promise.resolve(null),
      references: 0,
      cleanup: null,
    };
    created.pending = supabase.storage
      .from("game-assets")
      .download(path)
      .then(({ data, error }) => {
        if (error || !data || generation !== cacheGeneration) return null;
        created.url = URL.createObjectURL(data);
        return created.url;
      })
      .catch(() => null);
    entry = created;
    assetCache.set(path, entry);
  }
  if (entry.cleanup !== null) {
    window.clearTimeout(entry.cleanup);
    entry.cleanup = null;
  }
  entry.references += 1;

  return {
    pending: entry.pending,
    release: () => {
      entry!.references = Math.max(0, entry!.references - 1);
      if (entry!.references === 0) {
        entry!.cleanup = window.setTimeout(() => discardAsset(path, entry!), IDLE_CACHE_MS);
      }
    },
  };
}

function clearAssetCache() {
  cacheGeneration += 1;
  for (const [path, entry] of assetCache) discardAsset(path, entry);
}

let authCleanupInstalled = false;
function installAuthCleanup() {
  if (authCleanupInstalled || typeof window === "undefined") return;
  authCleanupInstalled = true;
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" || event === "SIGNED_IN") clearAssetCache();
  });
}

export function useGameAssetUrl(source: string | null | undefined) {
  const path = gameAssetPath(source);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(path ? null : source ?? null);

  useEffect(() => {
    installAuthCleanup();
    if (!path) {
      setResolvedUrl(source ?? null);
      return;
    }

    let active = true;
    setResolvedUrl(null);
    const asset = acquireAsset(path);
    void asset.pending.then((url) => {
      if (active) setResolvedUrl(url);
    });
    return () => {
      active = false;
      asset.release();
    };
  }, [path, source]);

  return resolvedUrl;
}
