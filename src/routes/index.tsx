import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "D20 Project - Virtual Tabletop for Multi-System RPGs" },
      { name: "description", content: "Run online RPG campaigns with real-time rolls, dynamic sheets, integrated chat, maps, and an AI narrator trained on your system's rules." },
      { property: "og:title", content: "D20 Project - Virtual Tabletop for Multi-System RPGs" },
      { property: "og:description", content: "Run online RPG campaigns with real-time rolls, dynamic sheets, integrated chat, maps, and an AI narrator trained on your system's rules." },
      { property: "og:url", content: "https://d20project.lovable.app/" },
    ],
    links: [
      { rel: "canonical", href: "https://d20project.lovable.app/" },
    ],
  }),
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    let finished = false;

    function go(to: "/auth" | "/dashboard") {
      if (cancelled || finished) return;
      finished = true;
      navigate({ to, replace: true });
    }

    const fallback = window.setTimeout(() => go("/auth"), 4500);

    supabase.auth.getSession()
      .then(({ data }) => {
        window.clearTimeout(fallback);
        go(data.session ? "/dashboard" : "/auth");
      })
      .catch((error) => {
        console.warn("[Startup] Could not restore initial session", error);
        window.clearTimeout(fallback);
        go("/auth");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <p className="text-sm font-semibold text-muted-foreground">Carregando D20 Project...</p>
    </div>
  );
}
