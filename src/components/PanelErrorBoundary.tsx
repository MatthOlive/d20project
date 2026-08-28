import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordClientDiagnostic } from "@/lib/client-diagnostics";

type Props = {
  children: ReactNode;
  scope: string;
  resetKey?: string;
};

type State = { error: Error | null };

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    recordClientDiagnostic(this.props.scope, error, { componentStack: info.componentStack });
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-3 p-5 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <div>
          <p className="text-sm font-semibold">Esta área encontrou um problema</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            O restante da mesa continua funcionando. Tente carregar somente esta área novamente.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Tentar novamente
        </Button>
      </div>
    );
  }
}
