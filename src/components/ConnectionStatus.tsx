import { useEffect, useState } from "react";
import { CloudOff, Download, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  retryPendingSaves,
  subscribeClientHealth,
  type ClientHealthSnapshot,
} from "@/lib/client-health";
import { downloadClientDiagnostics } from "@/lib/client-diagnostics";
import { supabase } from "@/integrations/supabase/client";

const HEALTHY: ClientHealthSnapshot = { pendingSaves: 0, saveErrors: 0, realtimeErrors: 0 };
const CONNECTIVITY_CHECK_INTERVAL_MS = 30_000;
const CONNECTIVITY_CHECK_TIMEOUT_MS = 6_000;

export function ConnectionStatus() {
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [backendReachable, setBackendReachable] = useState<boolean | null>(() =>
    typeof navigator === "undefined" || navigator.onLine ? true : null,
  );
  const [health, setHealth] = useState<ClientHealthSnapshot>(HEALTHY);

  useEffect(() => {
    let active = true;
    let probeInFlight = false;

    const probeBackend = async () => {
      if (probeInFlight) return;
      probeInFlight = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), CONNECTIVITY_CHECK_TIMEOUT_MS);
      try {
        const { error } = await supabase
          .from("games")
          .select("id")
          .limit(1)
          .abortSignal(controller.signal);
        if (active) setBackendReachable(!error);
      } catch {
        if (active) setBackendReachable(false);
      } finally {
        window.clearTimeout(timeout);
        probeInFlight = false;
      }
    };

    const connected = () => {
      setBrowserOnline(true);
      setBackendReachable(true);
    };
    const disconnected = () => {
      setBrowserOnline(false);
      setBackendReachable(null);
      void probeBackend();
    };
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    if (navigator.onLine === false) void probeBackend();
    const connectivityCheck = window.setInterval(() => {
      if (navigator.onLine === false) void probeBackend();
    }, CONNECTIVITY_CHECK_INTERVAL_MS);
    const unsubscribeHealth = subscribeClientHealth(setHealth);
    return () => {
      active = false;
      window.clearInterval(connectivityCheck);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
      unsubscribeHealth();
    };
  }, []);

  const checkingConnection = !browserOnline && backendReachable === null;
  const online = browserOnline || backendReachable === true;
  const degraded = health.realtimeErrors > 0;
  const failedSave = health.saveErrors > 0;
  if (checkingConnection || (online && !degraded && !failedSave)) return null;

  const message = !online
    ? health.pendingSaves > 0
      ? `${health.pendingSaves} alteração(ões) aguardando conexão.`
      : "Sem conexão. A mesa continua disponível com os dados locais."
    : failedSave
      ? `${health.pendingSaves} alteração(ões) ainda não foram sincronizadas.`
      : "A atualização em tempo real foi interrompida. Reconectando...";

  return (
    <div className="fixed left-1/2 top-3 z-[10000] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-2 rounded-md border border-amber-500/50 bg-background/95 px-3 py-2 text-xs font-semibold text-amber-500 shadow-lg backdrop-blur">
      {degraded && online ? (
        <WifiOff className="h-4 w-4 shrink-0" />
      ) : (
        <CloudOff className="h-4 w-4 shrink-0" />
      )}
      <span>{message}</span>
      {health.pendingSaves > 0 && online && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={retryPendingSaves}
          title="Tentar sincronizar agora"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={downloadClientDiagnostics}
        title="Baixar diagnóstico"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
