import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/join/$inviteCode")({
  component: JoinPage,
});

function JoinPage() {
  const { inviteCode } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      sessionStorage.setItem("pendingInvite", inviteCode);
      navigate({ to: "/auth" });
      return;
    }
    (async () => {
      const { data: game, error } = await supabase
        .from("games")
        .select("id,name")
        .eq("invite_code", inviteCode)
        .maybeSingle();
      if (error || !game) {
        toast.error("Invite link is invalid.");
        navigate({ to: "/dashboard" });
        return;
      }
      const { error: joinErr } = await supabase
        .from("game_members")
        .insert({ game_id: game.id, user_id: user.id, role: "player" });
      if (joinErr && !joinErr.message.includes("duplicate")) {
        toast.error(joinErr.message);
      } else {
        toast.success(`Joined ${game.name}`);
      }
      navigate({ to: "/games/$gameId", params: { gameId: game.id } });
    })();
  }, [user, loading, inviteCode, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Joining game…</p>
    </div>
  );
}
