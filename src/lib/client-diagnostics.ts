export type ClientDiagnostic = {
  at: string;
  scope: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
};

const STORAGE_KEY = "d20-client-diagnostics";
const MAX_ENTRIES = 50;
let installed = false;

function normalizeError(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack };
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

export function recordClientDiagnostic(
  scope: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  const normalized = normalizeError(error);
  const entry: ClientDiagnostic = {
    at: new Date().toISOString(),
    scope,
    ...normalized,
    context,
  };

  console.error(`[${scope}]`, error, context);
  if (typeof window === "undefined") return;

  try {
    const current = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as ClientDiagnostic[];
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...current.slice(-(MAX_ENTRIES - 1)), entry]),
    );
  } catch {
    // Diagnostics must never interfere with the game itself.
  }
}

export function readClientDiagnostics(): ClientDiagnostic[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as ClientDiagnostic[];
  } catch {
    return [];
  }
}

export function downloadClientDiagnostics() {
  if (typeof window === "undefined") return;
  const report = {
    generatedAt: new Date().toISOString(),
    appVersion: import.meta.env.VITE_APP_VERSION ?? "local",
    page: window.location.pathname,
    online: navigator.onLine,
    userAgent: navigator.userAgent,
    diagnostics: readClientDiagnostics(),
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `d20-diagnostico-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function installClientDiagnostics() {
  if (installed || typeof window === "undefined") return () => undefined;
  installed = true;
  const onError = (event: ErrorEvent) => {
    recordClientDiagnostic("window-error", event.error ?? event.message, {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    recordClientDiagnostic("unhandled-promise", event.reason);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    installed = false;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
