import { Check, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DebouncedSaveState } from "@/lib/use-debounced-patch";

export function AutosaveStatus({
  state,
  error,
  onRetry,
}: {
  state: DebouncedSaveState;
  error?: string | null;
  onRetry: () => void;
}) {
  if (state === "idle") return null;

  if (state === "error") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-destructive"
        title={error ?? "Alterações guardadas neste computador e ainda não enviadas."}
      >
        <CloudOff className="h-3.5 w-3.5" /> Não salvo
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-destructive"
          title="Tentar salvar novamente"
          onClick={onRetry}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </span>
    );
  }

  if (state === "saving" || state === "pending") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {state === "saving" ? "Salvando" : "Pendente"}
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-success">
      <Check className="h-3.5 w-3.5" /> Salvo
    </span>
  );
}
