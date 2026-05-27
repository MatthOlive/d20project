import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Users, Crown, Sparkles, Trash2, CheckSquare, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useT, LANGS, type Lang } from "@/lib/i18n";
import { ThemeToggle } from "@/components/ThemeToggle";
import { KnowledgeIngest } from "@/components/KnowledgeIngest";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { t } = useT();

  const { data: games, isLoading } = useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games")
        .select("id,name,background_url,invite_code,narrator_id,created_at,language,game_members(user_id,role)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [narratorType, setNarratorType] = useState<"human" | "ai">("human");
  const [language, setLanguage] = useState<Lang>("pt-BR");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const createGame = useMutation({
    mutationFn: async (gameName: string) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("games")
        .insert({ name: gameName, narrator_id: user.id, narrator_type: narratorType, language })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["games"] });
      setOpen(false);
      setName("");
      setNarratorType("human");
      setLanguage("pt-BR");
      toast.success("Game created!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function deleteGame(id: string, gameName: string) {
    if (!confirm(`${t("confirmDeleteGame")}\n— ${gameName}`)) return;
    const { error } = await supabase.from("games").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["games"] });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(t("confirmDeleteSelected"))) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("games").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} deleted`);
    setSelected(new Set());
    setSelectMode(false);
    qc.invalidateQueries({ queryKey: ["games"] });
  }

  function toggleSel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("yourGames")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("yourGamesSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <KnowledgeIngest />
          {!selectMode ? (
            <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
              <CheckSquare className="mr-1.5 h-4 w-4" /> {t("select")}
            </Button>
          ) : (
            <>
              <Button variant="destructive" size="sm" disabled={selected.size === 0} onClick={bulkDelete}>
                <Trash2 className="mr-1.5 h-4 w-4" /> {t("deleteSelected")} ({selected.size})
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setSelectMode(false); setSelected(new Set()); }}>
                <X className="mr-1.5 h-4 w-4" /> {t("cancel")}
              </Button>
            </>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1.5 h-4 w-4" /> {t("createNewGame")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("createNewGame")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="gname">{t("campaignName")}</Label>
                  <Input id="gname" value={name} onChange={(e) => setName(e.target.value)} placeholder="The Kanto Chronicles" />
                </div>
                <div className="space-y-2">
                  <Label>{t("narrator")}</Label>
                  <Select value={narratorType} onValueChange={(v) => setNarratorType(v as "human" | "ai")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="human"><span className="inline-flex items-center gap-2"><Crown className="h-3.5 w-3.5" /> {t("narratedByPerson")}</span></SelectItem>
                      <SelectItem value="ai"><span className="inline-flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" /> {t("narratedByAi")}</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("language")}</Label>
                  <Select value={language} onValueChange={(v) => setLanguage(v as Lang)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGS.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button disabled={!name.trim() || createGame.isPending} onClick={() => createGame.mutate(name.trim())}>
                  {t("create")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : games && games.length > 0 ? (
          games.map((g) => {
            const isOwner = g.narrator_id === user?.id;
            const memberCount = g.game_members?.length ?? 0;
            const card = (
              <div className="relative">
                {selectMode && isOwner && (
                  <div className="absolute left-2 top-2 z-10 rounded-md bg-background/90 p-1 backdrop-blur">
                    <Checkbox checked={selected.has(g.id)} onCheckedChange={() => toggleSel(g.id)} />
                  </div>
                )}
                {isOwner && !selectMode && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteGame(g.id, g.name); }}
                    className="absolute right-2 top-2 z-10 hidden h-7 w-7 items-center justify-center rounded-full bg-destructive/90 text-destructive-foreground shadow group-hover:flex"
                    title={t("delete")}
                  ><Trash2 className="h-3.5 w-3.5" /></button>
                )}
                <div
                  className="h-28 rounded-t-xl bg-muted"
                  style={g.background_url ? { backgroundImage: `url(${g.background_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                />
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">{g.name}</h3>
                    {isOwner ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        <Crown className="h-3 w-3" /> {t("narrator")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                        <Users className="h-3 w-3" /> {t("player")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {memberCount} {memberCount === 1 ? t("member") : t("members")}
                  </p>
                </div>
              </div>
            );
            if (selectMode) {
              return (
                <div key={g.id} className="group block rounded-xl border border-border bg-card">
                  {card}
                </div>
              );
            }
            return (
              <Link
                key={g.id}
                to="/games/$gameId"
                params={{ gameId: g.id }}
                className="group block rounded-xl border border-border bg-card transition hover:border-primary hover:shadow-sm"
              >
                {card}
              </Link>
            );
          })
        ) : (
          <Card className="col-span-full">
            <CardHeader><CardTitle>{t("noGamesYet")}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Hit <strong>{t("createNewGame")}</strong> to start.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
