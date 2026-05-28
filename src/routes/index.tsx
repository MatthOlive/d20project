import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <div className="pokedex-stripe text-pokedex-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full border-4 border-white bg-white">
              <div className="m-1 h-3 w-3 rounded-full bg-pokedex shadow-inner" />
            </div>
            <span className="text-lg font-extrabold tracking-tight">D20 Project</span>
          </div>
          <Link to="/auth">
            <Button variant="secondary" className="font-semibold">Sign in</Button>
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-20">
        <h1 className="text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl">
          Sua mesa de RPG, <span className="text-primary">em qualquer sistema</span>.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Um virtual tabletop modular para mesas de RPG. Fichas dinâmicas, rolagens em tempo real,
          chat integrado, mapas e um narrador de IA que conhece as regras do seu sistema.
        </p>
        <div className="mt-10 flex gap-3">
          <Link to="/auth">
            <Button size="lg" className="font-semibold">Começar agora</Button>
          </Link>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          {[
            { title: "Multi-sistema", body: "Crie campanhas para qualquer sistema. Hoje Pokérole 2.0, em breve D&D e T20." },
            { title: "Rolagens em tempo real", body: "Dados, sucessos e modificadores compartilhados com toda a mesa instantaneamente." },
            { title: "Narrador de IA", body: "Treine a IA com os PDFs do seu sistema e tenha um co-mestre que conhece as regras." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-base font-bold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
