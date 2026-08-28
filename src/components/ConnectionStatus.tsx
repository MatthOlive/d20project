import { useEffect, useState } from "react";
import { CloudOff, Download, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  retryPendingSaves,
  subscribeClientHealth,
  type ClientHealthSnapshot,
} from "@/lib/client-health";
import { downloadClientDiagnostics } from "@/lib/client-diagnostics";

const HEALTHY: ClientHealthSnapshot = { pendingSaves: 0, saveErrors: 0, realtimeErrors: 0 };

export function ConnectionStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [health, setHealth] = useState<ClientHealthSnapshot>(HEALTHY);

  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    const unsubscribeHealth = subscribeClientHealth(setHealth);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
      unsubscribeHealth();
    };
  }, []);

  const degraded = health.realtimeErrors > 0;
  const failedSave = health.saveErrors > 0;
  if (online && !degraded && !failedSave) return null;

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
