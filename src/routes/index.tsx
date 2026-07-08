import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

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
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate({ to: user ? "/dashboard" : "/auth" });
  }, [user, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <p className="text-sm font-semibold text-muted-foreground">Carregando D20 Project...</p>
    </div>
  );
}
