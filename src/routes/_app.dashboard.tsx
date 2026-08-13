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
import { Plus, Users, Crown, Sparkles, Trash2, CheckSquare, X, Compass } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useT, LANGS, type Lang } from "@/lib/i18n";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SettingsDialog, RPG_SYSTEMS } from "@/components/SettingsDialog";
import { CLASSIC_REGIONS, CLASSIC_START_CITIES, type ClassicRegionId } from "@/lib/classic-mode";

type DashboardGame = {
  id: string;
  name: string;
  background_url: string | null;
  narrator_id: string;
  system?: string | null;
  narrator_type?: string | null;
  classic_region?: string | null;
  game_members?: { user_id: string; role: string }[] | null;
};

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
      const { data, error } = await (supabase
        .from("games") as any)
        .select("id,name,background_url,narrator_id,created_at,language,system,narrator_type,classic_region,game_members(user_id,role)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DashboardGame[];
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [narratorType, setNarratorType] = useState<"human" | "ai" | "classic">("human");
  const [language, setLanguage] = useState<Lang>("pt-BR");
  const [system, setSystem] = useState<string>("pokerole");
  const [classicRegion, setClassicRegion] = useState<ClassicRegionId>("kanto");
  const [classicStartCity, setClassicStartCity] = useState("pallet");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const createGame = useMutation({
    mutationFn: async (gameName: string) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("games")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          name: gameName,
          narrator_id: user.id,
          narrator_type: narratorType,
          language,
          system,
          classic_region: narratorType === "classic" ? classicRegion : null,
          classic_start_city: narratorType === "classic" ? classicStartCity : null,
        } as any)
        .select("id,name,background_url,narrator_id,created_at,language,narrator_type,system")
        .single();
      if (error) throw error;
      if (narratorType === "classic") {
        const { error: campaignError } = await (supabase.from("classic_campaigns" as never) as any).insert({
          game_id: data.id,
          region: classicRegion,
          start_city: classicStartCity,
          story_key: "kanto_pallet_v1",
        });
        if (campaignError) {
          await supabase.from("games").delete().eq("id", data.id);
          throw campaignError;
        }
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
      setClassicRegion("kanto");
      setClassicStartCity("pallet");
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
                  <Select value={system} onValueChange={(value) => {
                    setSystem(value);
                    if (value !== "pokerole" && narratorType === "classic") setNarratorType("human");
                  }}>
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
                  <Select value={narratorType} onValueChange={(v) => setNarratorType(v as "human" | "ai" | "classic")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="human"><span className="inline-flex items-center gap-2"><Crown className="h-3.5 w-3.5" /> {t("narratedByPerson")}</span></SelectItem>
                      <SelectItem value="ai"><span className="inline-flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" /> {t("narratedByAi")}</span></SelectItem>
                      {system === "pokerole" && (
                        <SelectItem value="classic"><span className="inline-flex items-center gap-2"><Compass className="h-3.5 w-3.5" /> Modo Clássico</span></SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {narratorType === "classic" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Região inicial</Label>
                      <Select value={classicRegion} onValueChange={(value) => {
                        const region = value as ClassicRegionId;
                        setClassicRegion(region);
                        setClassicStartCity(CLASSIC_START_CITIES[region][0]?.id ?? "");
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CLASSIC_REGIONS.map((region) => (
                            <SelectItem key={region.id} value={region.id} disabled={!region.available}>
                              {region.label}{!region.available ? " — em breve" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Cidade inicial</Label>
                      <Select value={classicStartCity} onValueChange={setClassicStartCity}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CLASSIC_START_CITIES[classicRegion].map((city) => (
                            <SelectItem key={city.id} value={city.id}>{city.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Cada jogador criará seu próprio treinador e escolherá um Pokémon inicial ao entrar na jornada.
                    </p>
                  </div>
                )}
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
            const isOwner = g.narrator_id === user?.id;
            const memberCount = g.game_members?.length ?? 0;
            const gameMeta = g as { system?: string; narrator_type?: string; classic_region?: string | null };
            const isClassic = gameMeta.narrator_type === "classic";
            const systemLabel = RPG_SYSTEMS.find((s) => s.id === (g as { system?: string }).system)?.label ?? "PokÃ©role 2.0";
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
                        {isClassic ? <Compass className="h-3 w-3" /> : <Crown className="h-3 w-3" />}
                        {isClassic ? "Organizador" : t("narrator")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                        <Users className="h-3 w-3" /> {t("player")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isClassic && <span>Clássico · Kanto · </span>}
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
    </main>
  );
}
