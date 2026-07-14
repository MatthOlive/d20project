import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "downloading"; progress: number | null }
  | { status: "ready" }
  | { status: "none" }
  | { status: "error"; message: string };

function isTauriDesktop() {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

let autoUpdatePromise: Promise<void> | null = null;
let lastUpdateState: UpdateState | null = null;
let latestUpdateResource: unknown = null;
const updateStateListeners = new Set<(state: UpdateState) => void>();

function publishUpdateState(state: UpdateState) {
  lastUpdateState = state;
  updateStateListeners.forEach((listener) => listener(state));
}

async function downloadAndInstallUpdate(update: unknown) {
  if (!update || typeof update !== "object") return;
  const selectedUpdate = update as {
    downloadAndInstall: (onEvent?: (event: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void>;
  };
  let downloaded = 0;
  let total: number | null = null;
  publishUpdateState({ status: "downloading", progress: null });
  await selectedUpdate.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data?.contentLength ?? null;
      downloaded = 0;
      publishUpdateState({ status: "downloading", progress: null });
    } else if (event.event === "Progress") {
      downloaded += event.data?.chunkLength ?? 0;
      publishUpdateState({ status: "downloading", progress: total ? Math.min(100, Math.round((downloaded / total) * 100)) : null });
    } else if (event.event === "Finished") {
      publishUpdateState({ status: "ready" });
    }
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

function startAutomaticDesktopUpdate() {
  if (!isTauriDesktop()) return null;
  if (autoUpdatePromise) return autoUpdatePromise;

  autoUpdatePromise = (async () => {
    try {
      publishUpdateState({ status: "checking" });
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        publishUpdateState({ status: "none" });
        return;
      }
      latestUpdateResource = update;
      publishUpdateState({ status: "available", version: update.version });
      await downloadAndInstallUpdate(update);
    } catch (error) {
      publishUpdateState({ status: "error", message: error instanceof Error ? error.message : "Nao foi possivel verificar atualizacoes." });
    }
  })();

  return autoUpdatePromise;
}

export function DesktopAutoUpdater() {
  useEffect(() => {
    void startAutomaticDesktopUpdate();
  }, []);

  return null;
}

export function DesktopUpdater({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const [updateResource, setUpdateResource] = useState<unknown>(null);
  const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "dev";
  const desktop = isTauriDesktop();

  async function checkForUpdates({ silent = false, autoInstall = false }: { silent?: boolean; autoInstall?: boolean } = {}) {
    if (!desktop) return;
    try {
      if (!silent) publishUpdateState({ status: "checking" });
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        if (!silent) publishUpdateState({ status: "none" });
        return;
      }
      latestUpdateResource = update;
      setUpdateResource(update);
      publishUpdateState({ status: "available", version: update.version });
      if (autoInstall) {
        await installUpdate(update);
      }
    } catch (error) {
      publishUpdateState({ status: "error", message: error instanceof Error ? error.message : "Nao foi possivel verificar atualizacoes." });
    }
  }

  async function installUpdate(updateOverride?: unknown) {
    const selectedUpdate = updateOverride ?? updateResource ?? latestUpdateResource;
    await downloadAndInstallUpdate(selectedUpdate);
  }

  useEffect(() => {
    const listener = (nextState: UpdateState) => setState(nextState);
    updateStateListeners.add(listener);
    if (lastUpdateState) setState(lastUpdateState);

    const promise = startAutomaticDesktopUpdate();
    if (promise) void promise;

    return () => {
      updateStateListeners.delete(listener);
    };
  }, []);

  const className = compact
    ? "inline-flex min-w-[11rem] flex-col text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400"
    : "rounded-md border border-border bg-card p-3 text-sm text-muted-foreground";

  return (
    <div className={className}>
      {state.status === "idle" && (
        <button type="button" onClick={() => void checkForUpdates()} className="hover:text-red-600">
          {desktop ? `${appVersion} - verificar atualizacao` : `${appVersion} - web`}
        </button>
      )}
      {state.status === "checking" && <span>Verificando atualizacoes...</span>}
      {state.status === "none" && <span>{`${appVersion} - atualizado`}</span>}
      {state.status === "available" && (
        <div className="space-y-2">
          <p>Atualizacao {state.version} disponivel</p>
          <Button type="button" size="sm" onClick={() => void installUpdate()} className="h-8 bg-red-600 text-white hover:bg-red-700">
            Atualizar agora
          </Button>
        </div>
      )}
      {state.status === "downloading" && (
        <UpdateDownloadStatus progress={state.progress} compact={compact} />
      )}
      {state.status === "ready" && <span>Instalando e reiniciando...</span>}
      {state.status === "error" && (
        <button type="button" title={state.message} onClick={() => void checkForUpdates({ autoInstall: true })} className="hover:text-red-600">
          {`${appVersion} - atualizador indisponivel`}
        </button>
      )}
    </div>
  );
}

function UpdateDownloadStatus({ progress, compact }: { progress: number | null; compact: boolean }) {
  const percent = typeof progress === "number" ? Math.max(0, Math.min(100, progress)) : null;
  const trackClass = compact ? "bg-white/25" : "bg-primary/15";
  const barClass = compact ? "bg-white" : "bg-primary";

  return (
    <div className="w-full space-y-1.5">
      <span>Baixando atualizacao{percent === null ? "..." : ` ${percent}%`}</span>
      <div className={`h-1.5 w-full overflow-hidden rounded-full ${trackClass}`}>
        {percent === null ? (
          <div className={`desktop-update-progress-indeterminate h-full rounded-full ${barClass}`} />
        ) : (
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${barClass}`}
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
    </div>
  );
}
