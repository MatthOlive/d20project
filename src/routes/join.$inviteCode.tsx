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
      const { data, error } = await supabase.rpc("join_game_by_invite", { _code: inviteCode });
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) {
        toast.error("Invite link is invalid.");
        navigate({ to: "/dashboard" });
        return;
      }
      toast.success(`Joined ${row.game_name}`);
      navigate({ to: "/games/$gameId", params: { gameId: row.game_id } });
    })();
  }, [user, loading, inviteCode, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Joining game…</p>
    </div>
  );
}
