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
import { Plus, Users, Crown, Sparkles, Trash2, CheckSquare, Settings2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useT, LANGS, type Lang } from "@/lib/i18n";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SettingsDialog, RPG_SYSTEMS } from "@/components/SettingsDialog";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Your campaigns — D20 Project" },
      { name: "description", content: "Manage your tabletop RPG campaigns on D20 Project. Create new games, join existing ones, and jump back into your virtual tabletop sessions." },
      { property: "og:title", content: "Your campaigns — D20 Project" },
      { property: "og:description", content: "Manage your tabletop RPG campaigns on D20 Project. Create new games, join existing ones, and jump back into your virtual tabletop sessions." },
      { property: "og:url", content: "https://d20project.lovable.app/dashboard" },
    ],
    links: [
      { rel: "canonical", href: "https://d20project.lovable.app/dashboard" },
    ],
  }),
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
        .select("*,game_members(user_id,role,display_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [narratorType, setNarratorType] = useState<"human" | "ai">("human");
  const [language, setLanguage] = useState<Lang>("pt-BR");
  const [system, setSystem] = useState<string>("pokerole");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingGame, setEditingGame] = useState<{
    id: string;
    name: string;
    system: string | null;
    narrator_id: string;
    owner_id?: string | null;
    game_members?: Array<{ user_id: string; role: string; display_name: string | null }>;
  } | null>(null);
  const [editName, setEditName] = useState("");
  const [editSystem, setEditSystem] = useState("pokerole");
  const [editOwnerId, setEditOwnerId] = useState("");
  const [editNarratorId, setEditNarratorId] = useState("");

  function openGameSettings(game: NonNullable<typeof editingGame>) {
    setEditingGame(game);
    setEditName(game.name);
    setEditSystem(game.system || "pokerole");
    setEditOwnerId(game.owner_id || game.narrator_id);
    setEditNarratorId(game.narrator_id);
  }

  const updateGameSettings = useMutation({
    mutationFn: async () => {
      if (!editingGame) return;
      const { error } = await supabase.rpc("update_game_dashboard_settings" as never, {
        p_game_id: editingGame.id,
        p_name: editName.trim(),
        p_system: editSystem,
        p_owner_id: editOwnerId,
        p_narrator_id: editNarratorId,
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      setEditingGame(null);
      await qc.invalidateQueries({ queryKey: ["games"] });
      toast.success("Configurações da mesa atualizadas.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createGame = useMutation({
    mutationFn: async (gameName: string) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("games")
        .insert({
          name: gameName,
          narrator_id: user.id,
          narrator_type: narratorType,
          language,
          system,
        })
        .select("id,name,background_url,narrator_id,created_at,language,narrator_type,system")
        .single();
      if (error) throw error;

      const { data: firstPage, error: pageError } = await supabase
        .from("scenarios")
        .insert({ game_id: data.id, name: "Página 1", background_url: data.background_url })
        .select("id")
        .single();
      if (pageError) {
        await supabase.from("games").delete().eq("id", data.id);
        throw new Error(`Não foi possível preparar a primeira página: ${pageError.message}`);
      }

      const { error: activateError } = await supabase
        .from("games")
        .update({ active_page_id: firstPage.id })
        .eq("id", data.id);
      if (activateError) {
        await supabase.from("games").delete().eq("id", data.id);
        throw new Error(`Não foi possível ativar a primeira página: ${activateError.message}`);
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["games"] });
      setOpen(false);
      setName("");
      setNarratorType("human");
      setLanguage("pt-BR");
      setSystem("pokerole");
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
          <SettingsDialog />
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
                  <Label>Sistema</Label>
                  <Select value={system} onValueChange={setSystem}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RPG_SYSTEMS.map((s) => (
                        <SelectItem key={s.id} value={s.id} disabled={!s.available}>
                          {s.label}{!s.available ? " — em breve" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <Button disabled={!name.trim() || !system || createGame.isPending} onClick={() => createGame.mutate(name.trim())}>
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
            const ownerId = (g as { owner_id?: string | null }).owner_id || g.narrator_id;
            const isOwner = ownerId === user?.id;
            const canManage = isOwner || g.narrator_id === user?.id;
            const memberCount = g.game_members?.length ?? 0;
            const systemLabel = RPG_SYSTEMS.find((s) => s.id === (g as { system?: string }).system)?.label ?? "PokéRole 2.0";
            const card = (
              <div className="relative">
                {selectMode && isOwner && (
                  <div className="absolute left-2 top-2 z-10 rounded-md bg-background/90 p-1 backdrop-blur">
                    <Checkbox checked={selected.has(g.id)} onCheckedChange={() => toggleSel(g.id)} />
                  </div>
                )}
                {canManage && !selectMode && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openGameSettings(g as NonNullable<typeof editingGame>);
                    }}
                    className="absolute right-10 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow transition hover:bg-accent"
                    title={`Configurações de ${g.name}`}
                    aria-label={`Configurações de ${g.name}`}
                  ><Settings2 className="h-3.5 w-3.5" /></button>
                )}
                {isOwner && !selectMode && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteGame(g.id, g.name); }}
                    className="absolute right-2 top-2 z-10 hidden h-7 w-7 items-center justify-center rounded-full bg-destructive/90 text-destructive-foreground shadow group-hover:flex"
                    title={`${t("delete")} ${g.name}`}
                    aria-label={`${t("delete")} ${g.name}`}
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
                        <Crown className="h-3 w-3" />
                        {t("narrator")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                        <Users className="h-3 w-3" /> {t("player")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {systemLabel} Â· {memberCount} {memberCount === 1 ? t("member") : t("members")}
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

      <Dialog open={!!editingGame} onOpenChange={(next) => !next && setEditingGame(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Configurações da mesa</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-game-name">Nome da mesa</Label>
              <Input id="edit-game-name" value={editName} onChange={(event) => setEditName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Sistema de RPG</Label>
              <Select value={editSystem} onValueChange={setEditSystem}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RPG_SYSTEMS.map((item) => (
                    <SelectItem key={item.id} value={item.id} disabled={!item.available}>
                      {item.label}{!item.available ? " — em breve" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Dono</Label>
              <Select value={editOwnerId} onValueChange={setEditOwnerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(editingGame?.game_members ?? []).map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.display_name || member.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mestre</Label>
              <Select value={editNarratorId} onValueChange={setEditNarratorId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(editingGame?.game_members ?? []).map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.display_name || member.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGame(null)}>Cancelar</Button>
            <Button
              disabled={!editName.trim() || !editOwnerId || !editNarratorId || updateGameSettings.isPending}
              onClick={() => updateGameSettings.mutate()}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
