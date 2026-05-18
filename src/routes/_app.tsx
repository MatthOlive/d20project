import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: AppLayout,
});

function AppLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="pokedex-stripe text-pokedex-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full border-[3px] border-white bg-white">
              <div className="m-[3px] h-2.5 w-2.5 rounded-full bg-pokedex" />
            </div>
            <span className="text-base font-extrabold tracking-tight">Pokérole VTT</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline opacity-90">{user?.email}</span>
            <Button variant="secondary" size="sm" onClick={signOut}>
              <LogOut className="mr-1.5 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
