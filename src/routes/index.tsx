import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppDownloads } from "@/components/AppDownloads";
import { Button } from "@/components/ui/button";
import { Dice5 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({ meta: [{ title: "D20 Project" }] }),
});

function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    // Keep the installed desktop app's existing startup flow.
    if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window) {
      navigate({ to: "/auth", replace: true });
    }
  }, [navigate]);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-lg">
        <Dice5 className="mb-4 h-12 w-12 text-primary" />
        <h1 className="text-3xl font-extrabold">D20 Project</h1>
        <p className="mt-3 text-muted-foreground">Sua mesa de RPG, no computador ou no celular. Acesse suas mesas, fichas, mapas e chat com a mesma conta.</p>
        <div className="mt-5"><Button asChild><Link to={user ? "/dashboard" : "/auth"}>{user ? "Abrir minhas mesas" : "Entrar"}</Link></Button></div>
        <AppDownloads />
      </div>
    </main>
  );
}
