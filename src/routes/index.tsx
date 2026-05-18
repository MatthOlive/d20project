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
            <span className="text-lg font-extrabold tracking-tight">Pokérole VTT</span>
          </div>
          <Link to="/auth">
            <Button variant="secondary" className="font-semibold">Sign in</Button>
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-20">
        <h1 className="text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl">
          Run Pokérole 2.0 sessions <span className="text-primary">at the table</span>.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          A virtual tabletop built for the Pokérole 2.0 RPG. Species-aware sheets,
          rank-filtered moves, dice rolls in real time, and a chat that knows when you crit.
        </p>
        <div className="mt-10 flex gap-3">
          <Link to="/auth">
            <Button size="lg" className="font-semibold">Get started</Button>
          </Link>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          {[
            { title: "Pokémon sheet engine", body: "Species auto-fill, rank-locked moves, hard Insight + 2 cap." },
            { title: "Realtime chat & dice", body: "D10 rolls with success counts highlighted in green." },
            { title: "Narrator tools", body: "Invite links, initiative tracker, character permissions." },
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
