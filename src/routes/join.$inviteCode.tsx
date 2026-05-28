import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
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
  const ran = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      sessionStorage.setItem("pendingInvite", inviteCode);
      navigate({ to: "/auth" });
      return;
    }
    if (ran.current) return;
    ran.current = true;

    (async () => {
      // Make sure the bearer token is hydrated before the RPC runs —
      // a hot navigation post-login can race the session restore.
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) {
        sessionStorage.setItem("pendingInvite", inviteCode);
        navigate({ to: "/auth" });
        return;
      }

      const { data, error } = await supabase.rpc("join_game_by_invite", { _code: inviteCode });
      const row = Array.isArray(data) ? data[0] : null;
      if (error) {
        console.error("[join] rpc error:", error);
        toast.error(error.message || "Invite link is invalid.");
        navigate({ to: "/dashboard" });
        return;
      }
      if (!row) {
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
