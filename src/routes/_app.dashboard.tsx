import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Users, Crown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: games, isLoading } = useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games")
        .select("id,name,background_url,invite_code,narrator_id,created_at,game_members(user_id,role)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const createGame = useMutation({
    mutationFn: async (gameName: string) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("games")
        .insert({ name: gameName, narrator_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["games"] });
      setOpen(false);
      setName("");
      toast.success("Game created!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Your games</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a new campaign as Narrator, or join one with an invite link.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1.5 h-4 w-4" /> Create New Game</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create a new game</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="gname">Campaign name</Label>
              <Input id="gname" value={name} onChange={(e) => setName(e.target.value)} placeholder="The Kanto Chronicles" />
            </div>
            <DialogFooter>
              <Button
                disabled={!name.trim() || createGame.isPending}
                onClick={() => createGame.mutate(name.trim())}
              >Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : games && games.length > 0 ? (
          games.map((g) => (
            <Link
              key={g.id}
              to="/games/$gameId"
              params={{ gameId: g.id }}
              className="block rounded-xl border border-border bg-card transition hover:border-primary hover:shadow-sm"
            >
              <div
                className="h-28 rounded-t-xl bg-muted"
                style={
                  g.background_url
                    ? { backgroundImage: `url(${g.background_url})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : undefined
                }
              />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">{g.name}</h3>
                  {g.narrator_id === user?.id ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      <Crown className="h-3 w-3" /> Narrator
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      <Users className="h-3 w-3" /> Player
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {g.game_members?.length ?? 0} member{(g.game_members?.length ?? 0) === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
          ))
        ) : (
          <Card className="col-span-full">
            <CardHeader><CardTitle>No games yet</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Hit <strong>Create New Game</strong> to start your first session as Narrator.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
