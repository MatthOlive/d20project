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

export function DesktopUpdater({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const [updateResource, setUpdateResource] = useState<unknown>(null);
  const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "dev";
  const desktop = isTauriDesktop();

  async function checkForUpdates({ silent = false }: { silent?: boolean } = {}) {
    if (!desktop) return;
    try {
      if (!silent) setState({ status: "checking" });
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        if (!silent) setState({ status: "none" });
        return;
      }
      setUpdateResource(update);
      setState({ status: "available", version: update.version });
    } catch (error) {
      if (!silent) {
        setState({ status: "error", message: error instanceof Error ? error.message : "Nao foi possivel verificar atualizacoes." });
      }
    }
  }

  async function installUpdate() {
    if (!updateResource || typeof updateResource !== "object") return;
    const update = updateResource as {
      downloadAndInstall: (onEvent?: (event: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void>;
    };
    let downloaded = 0;
    let total: number | null = null;
    setState({ status: "downloading", progress: null });
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data?.contentLength ?? null;
        setState({ status: "downloading", progress: null });
      } else if (event.event === "Progress") {
        downloaded += event.data?.chunkLength ?? 0;
        setState({ status: "downloading", progress: total ? Math.round((downloaded / total) * 100) : null });
      } else if (event.event === "Finished") {
        setState({ status: "ready" });
      }
    });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  }

  useEffect(() => {
    void checkForUpdates({ silent: true });
  }, []);

  const className = compact
    ? "text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400"
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
        <span>Baixando atualizacao{state.progress === null ? "..." : ` ${state.progress}%`}</span>
      )}
      {state.status === "ready" && <span>Reiniciando...</span>}
      {state.status === "error" && <span title={state.message}>{`${appVersion} - atualizador indisponivel`}</span>}
    </div>
  );
}
