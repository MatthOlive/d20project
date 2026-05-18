import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChatPanel } from "@/components/ChatPanel";
import { FloatingWindow } from "@/components/FloatingWindow";
import { PokemonSheet } from "@/components/PokemonSheet";
import { TrainerSheet } from "@/components/TrainerSheet";
import { MapBoard, DRAG_MIME, type DragCharacterPayload } from "@/components/MapBoard";
import { toast } from "sonner";
import { Copy, Crown, Sparkles, User, FolderPlus, Folder, FolderOpen, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { rollD6, POKEMON_TYPES, TYPE_COLORS, type PokemonType } from "@/lib/pokerole";

export const Route = createFileRoute("/_app/games/$gameId")({
  component: GameRoom,
});

type OpenWindow =
  | { kind: "pokemon"; id: string; title: string }
  | { kind: "trainer"; id: string; title: string };

function GameRoom() {
  const { gameId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: game } = useQuery({
    queryKey: ["game", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games").select("*").eq("id", gameId).single();
      if (error) throw error;
      return data;
    },
  });

  // Character list lives in <FilesPanel>.

  const { data: speciesList } = useQuery({
    queryKey: ["species-list"],
    queryFn: async () => {
      const { data } = await supabase.from("species").select("id,name").order("dex_number");
      return data ?? [];
    },
  });

  const [windows, setWindows] = useState<OpenWindow[]>([]);

  function openWindow(w: OpenWindow) {
    if (!windows.find((x) => x.kind === w.kind && x.id === w.id)) {
      setWindows((p) => [...p, w]);
    }
  }
  function closeWindow(kind: string, id: string) {
    setWindows((p) => p.filter((x) => !(x.kind === kind && x.id === id)));
  }

  const isNarrator = !!game && !!user && game.narrator_id === user.id;

  async function rollFromSheet(label: string, n: number, penalty = 0) {
    if (!user) return;
    const result = rollD6(n);
    const adjusted = Math.max(0, result.successes - (penalty || 0));
    const finalLabel = penalty > 0 ? `${label} (−${penalty} pain)` : label;
    await supabase.from("chat_messages").insert({
      game_id: gameId, user_id: user.id, kind: "roll",
      body: finalLabel, roll_data: { ...result, successes: adjusted, penalty, label: finalLabel },
    });
  }
  async function sendChatFromSheet(body: string) {
    if (!user || !body.trim()) return;
    await supabase.from("chat_messages").insert({
      game_id: gameId, user_id: user.id, kind: "chat", body,
    });
  }

  const inviteUrl = typeof window !== "undefined" && game
    ? `${window.location.origin}/join/${game.invite_code}` : "";

  // Character creation lives in <FilesPanel>.

  async function uploadBackground(file: File) {
    if (!isNarrator) return;
    // Use data URL for v1 (file storage bucket can be added later)
    const reader = new FileReader();
    reader.onload = async () => {
      await supabase.from("games").update({ background_url: reader.result as string }).eq("id", gameId);
      qc.invalidateQueries({ queryKey: ["game", gameId] });
    };
    reader.readAsDataURL(file);
  }

  if (!game || !user) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto grid h-[calc(100vh-4rem)] max-w-7xl grid-cols-1 gap-3 px-3 py-3 lg:grid-cols-[1fr_360px]">
      {/* Center: background + characters */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="relative flex-1 min-h-0">
          <MapBoard
            gameId={gameId}
            backgroundUrl={game.background_url}
            userId={user.id}
            isNarrator={isNarrator}
            topLeftSlot={
              <>
                <span className="rounded-full bg-card/90 px-3 py-1 text-sm font-bold backdrop-blur">{game.name}</span>
                {isNarrator && (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                      <Crown className="h-3 w-3" /> Narrator
                    </span>
                    <InviteButton url={inviteUrl} />
                    <label className="cursor-pointer rounded-full bg-card/90 px-3 py-1 text-xs font-semibold backdrop-blur hover:bg-card">
                      Set background
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadBackground(e.target.files[0])} />
                    </label>
                    <ScenarioButtons gameId={gameId} currentBg={game.background_url} />
                  </>
                )}
              </>
            }
          />
        </div>
      </div>

      {/* Right: tabs */}
      <Card className="flex min-h-0 flex-col overflow-hidden p-0">
        <Tabs defaultValue="chat" className="flex h-full flex-col">
          <TabsList className="m-2 grid grid-cols-3">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="compendium">Compendium</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="flex-1 overflow-hidden">
            <ChatPanel gameId={gameId} userId={user.id} />
          </TabsContent>
          <TabsContent value="compendium" className="flex-1 overflow-auto p-3">
            <CompendiumPanel />
          </TabsContent>
          <TabsContent value="files" className="flex-1 overflow-auto p-3">
            <FilesPanel gameId={gameId} userId={user.id} onOpen={openWindow} />
          </TabsContent>
        </Tabs>
      </Card>

      {/* Floating sheet windows */}
      <div className="pointer-events-none">
        {windows.map((w, i) => (
          <FloatingWindow
            key={`${w.kind}-${w.id}`}
            title={w.title}
            onClose={() => closeWindow(w.kind, w.id)}
            initialX={120 + i * 30}
            initialY={80 + i * 30}
            width={560}
            height={600}
          >
            {w.kind === "pokemon"
              ? <PokemonSheet pokemonId={w.id} gameId={gameId} userId={user.id} isNarrator={isNarrator} onRoll={rollFromSheet} onChat={sendChatFromSheet} onDeleted={() => { closeWindow(w.kind, w.id); qc.invalidateQueries({ queryKey: ["characters", gameId] }); }} />
              : <TrainerSheet trainerId={w.id} userId={user.id} isNarrator={isNarrator} onRoll={rollFromSheet} onDeleted={() => { closeWindow(w.kind, w.id); qc.invalidateQueries({ queryKey: ["characters", gameId] }); }} />}
          </FloatingWindow>
        ))}
      </div>
    </div>
  );
}

function InviteButton({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">Invite</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite players</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Share this link. Anyone signed in can join.</p>
        <div className="flex gap-2">
          <Input value={url} readOnly />
          <Button
            onClick={() => {
              navigator.clipboard.writeText(url);
              toast.success("Invite link copied");
            }}
          ><Copy className="h-4 w-4" /></Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type CharRow =
  | { kind: "trainer"; id: string; label: string; owner_id: string; image_url: string | null; folder: string | null; sprite_url?: string | null }
  | { kind: "pokemon"; id: string; label: string; owner_id: string; image_url: string | null; folder: string | null; sprite_url: string | null };

const FOLDER_MIME = "application/x-pokerole-sheet";

function FilesPanel({
  gameId,
  userId,
  onOpen,
}: {
  gameId: string;
  userId: string;
  onOpen: (w: OpenWindow) => void;
}) {
  const qc = useQueryClient();
  const [pkmDialogOpen, setPkmDialogOpen] = useState(false);
  const [newPkmSpecies, setNewPkmSpecies] = useState<string>("");
  const [newFolder, setNewFolder] = useState("");
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [dropHover, setDropHover] = useState<string | null>(null);

  const { data: characters } = useQuery({
    queryKey: ["characters", gameId],
    queryFn: async () => {
      const [pkm, tr] = await Promise.all([
        supabase.from("pokemon").select("id,nickname,owner_id,image_url,folder,species:species_id(name,sprite_url)").eq("game_id", gameId),
        supabase.from("trainers").select("id,name,owner_id,image_url,folder").eq("game_id", gameId),
      ]);
      return {
        pokemon: (pkm.data ?? []) as { id: string; nickname: string | null; owner_id: string; image_url: string | null; folder: string | null; species: { name: string; sprite_url: string | null } }[],
        trainers: (tr.data ?? []) as { id: string; name: string; owner_id: string; image_url: string | null; folder: string | null }[],
      };
    },
  });

  const { data: speciesList } = useQuery({
    queryKey: ["species-list"],
    queryFn: async () => {
      const { data } = await supabase.from("species").select("id,name").order("dex_number");
      return data ?? [];
    },
  });

  const createTrainer = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("trainers")
        .insert({ game_id: gameId, owner_id: userId, name: "New Trainer" })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["characters", gameId] });
      onOpen({ kind: "trainer", id: t.id, title: t.name });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createPokemon = useMutation({
    mutationFn: async () => {
      if (!newPkmSpecies) throw new Error("Pick a species");
      const { data, error } = await supabase
        .from("pokemon")
        .insert({ game_id: gameId, owner_id: userId, species_id: newPkmSpecies, rank: "starter" })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["characters", gameId] });
      setPkmDialogOpen(false);
      setNewPkmSpecies("");
      onOpen({ kind: "pokemon", id: p.id, title: "Pokémon" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows: CharRow[] = [
    ...(characters?.trainers ?? []).map<CharRow>((t) => ({
      kind: "trainer", id: t.id, label: t.name, owner_id: t.owner_id,
      image_url: t.image_url, folder: t.folder, sprite_url: null,
    })),
    ...(characters?.pokemon ?? []).map<CharRow>((p) => ({
      kind: "pokemon", id: p.id, label: p.nickname ?? p.species.name, owner_id: p.owner_id,
      image_url: p.image_url, folder: p.folder, sprite_url: p.species.sprite_url,
    })),
  ];

  const folderNames = Array.from(
    new Set<string>([
      ...rows.map((r) => r.folder).filter((f): f is string => !!f),
      ...extraFolders,
    ]),
  ).sort();
  const groups: { name: string | null; items: CharRow[] }[] = [
    ...folderNames.map((name) => ({ name, items: rows.filter((r) => r.folder === name) })),
    { name: null, items: rows.filter((r) => !r.folder) },
  ];

  async function moveToFolder(row: CharRow, folder: string | null) {
    if (row.folder === folder) return;
    const table = row.kind === "trainer" ? "trainers" : "pokemon";
    const { error } = await supabase.from(table).update({ folder }).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["characters", gameId] });
  }

  function addFolder() {
    const name = newFolder.trim();
    if (!name) return;
    if (!extraFolders.includes(name) && !folderNames.includes(name)) {
      setExtraFolders((p) => [...p, name]);
    }
    setNewFolder("");
  }

  function renderItem(r: CharRow) {
    const mapPayload: DragCharacterPayload = {
      kind: r.kind, id: r.id, label: r.label,
      imageUrl: r.image_url ?? (r.kind === "pokemon" ? r.sprite_url : null), ownerId: r.owner_id,
    };
    return (
      <button
        key={`${r.kind}-${r.id}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_MIME, JSON.stringify(mapPayload));
          e.dataTransfer.setData(FOLDER_MIME, JSON.stringify({ kind: r.kind, id: r.id, folder: r.folder }));
          e.dataTransfer.effectAllowed = "copyMove";
        }}
        onClick={() => onOpen({ kind: r.kind, id: r.id, title: r.label })}
        className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:border-primary"
      >
        {r.kind === "pokemon" && r.sprite_url
          ? <img src={r.sprite_url} alt="" className="h-6 w-6 shrink-0" />
          : <User className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{r.label}</span>
      </button>
    );
  }

  function FolderGroup({ name, items }: { name: string | null; items: CharRow[] }) {
    const key = name ?? "__root__";
    const isHover = dropHover === key;
    return (
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(FOLDER_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropHover(key);
          }
        }}
        onDragLeave={() => setDropHover((h) => (h === key ? null : h))}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData(FOLDER_MIME);
          setDropHover(null);
          if (!raw) return;
          e.preventDefault();
          const { kind, id } = JSON.parse(raw) as { kind: "trainer" | "pokemon"; id: string };
          const row = rows.find((r) => r.kind === kind && r.id === id);
          if (row) moveToFolder(row, name);
        }}
        className={`rounded-md border ${isHover ? "border-primary bg-accent/40" : "border-border bg-background"} p-2`}
      >
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          {name ? <Folder className="h-3.5 w-3.5" /> : <FolderOpen className="h-3.5 w-3.5" />}
          {name ?? "Unfiled"}
          <span className="ml-1 text-[10px] opacity-60">({items.length})</span>
        </div>
        <div className="space-y-1.5">
          {items.map(renderItem)}
          {items.length === 0 && (
            <p className="px-2 py-1 text-[11px] text-muted-foreground">Drop a sheet here.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Characters</h3>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => createTrainer.mutate()}>
            <User className="mr-1 h-3.5 w-3.5" /> Trainer
          </Button>
          <Dialog open={pkmDialogOpen} onOpenChange={setPkmDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Sparkles className="mr-1 h-3.5 w-3.5" /> Pokémon</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create a Pokémon</DialogTitle></DialogHeader>
              <Label>Species</Label>
              <Select value={newPkmSpecies} onValueChange={setNewPkmSpecies}>
                <SelectTrigger><SelectValue placeholder="Pick a species" /></SelectTrigger>
                <SelectContent>
                  {speciesList?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button onClick={() => createPokemon.mutate()} disabled={createPokemon.isPending}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          value={newFolder}
          onChange={(e) => setNewFolder(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addFolder()}
          placeholder="New folder name…"
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" onClick={addFolder} disabled={!newFolder.trim()}>
          <FolderPlus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Tip: drag a character onto the map to place a token, or onto a folder to organize.
      </p>

      <div className="space-y-2">
        {groups.map((g) => <FolderGroup key={g.name ?? "__root__"} name={g.name} items={g.items} />)}
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">No characters yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Scenarios (narrator-only)
// ============================================================

type Scenario = { id: string; game_id: string; name: string; background_url: string | null; notes: string };

function ScenarioButtons({ gameId, currentBg }: { gameId: string; currentBg: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: scenarios = [] } = useQuery({
    queryKey: ["scenarios", gameId],
    queryFn: async () => {
      const { data } = await supabase.from("scenarios").select("*").eq("game_id", gameId).order("created_at");
      return (data ?? []) as Scenario[];
    },
  });

  async function createScenario() {
    const name = prompt("Scenario name?")?.trim();
    if (!name) return;
    const { error } = await supabase.from("scenarios").insert({ game_id: gameId, name, background_url: currentBg });
    if (error) toast.error(error.message);
    else { toast.success("Scenario created"); qc.invalidateQueries({ queryKey: ["scenarios", gameId] }); }
  }
  async function applyScenario(s: Scenario) {
    await supabase.from("games").update({ background_url: s.background_url }).eq("id", gameId);
    qc.invalidateQueries({ queryKey: ["game", gameId] });
    toast.success(`Loaded "${s.name}"`);
    setOpen(false);
  }
  async function uploadBg(s: Scenario, file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      await supabase.from("scenarios").update({ background_url: reader.result as string }).eq("id", s.id);
      qc.invalidateQueries({ queryKey: ["scenarios", gameId] });
    };
    reader.readAsDataURL(file);
  }
  async function deleteScenario(id: string) {
    if (!confirm("Delete this scenario?")) return;
    await supabase.from("scenarios").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["scenarios", gameId] });
  }
  async function rename(s: Scenario) {
    const name = prompt("Rename scenario", s.name)?.trim();
    if (!name) return;
    await supabase.from("scenarios").update({ name }).eq("id", s.id);
    qc.invalidateQueries({ queryKey: ["scenarios", gameId] });
  }

  return (
    <>
      <Button size="sm" variant="secondary" className="h-7" onClick={createScenario}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Scenario
      </Button>
      <Button size="sm" variant="secondary" className="h-7" onClick={() => setOpen(true)}>
        <Folder className="mr-1 h-3.5 w-3.5" /> Scenarios ({scenarios.length})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden">
          <DialogHeader><DialogTitle>Scenarios</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {scenarios.length === 0 && <p className="text-sm text-muted-foreground">No scenarios yet. Click "Scenario" to capture the current map as a scenario.</p>}
            {scenarios.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
                {s.background_url
                  ? <img src={s.background_url} alt="" className="h-14 w-20 rounded object-cover" />
                  : <div className="flex h-14 w-20 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">No bg</div>}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                </div>
                <Button size="sm" variant="default" className="h-7" onClick={() => applyScenario(s)}>Load</Button>
                <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-2 text-xs hover:bg-accent">
                  <ImageIcon className="h-3.5 w-3.5" />
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadBg(s, e.target.files[0])} />
                </label>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => rename(s)}>Rename</Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteScenario(s.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// Compendium: Pokédex, Moves by type, Abilities
// ============================================================

function CompendiumPanel() {
  return (
    <Tabs defaultValue="pokedex" className="flex h-full flex-col">
      <TabsList className="grid grid-cols-3">
        <TabsTrigger value="pokedex">Pokédex</TabsTrigger>
        <TabsTrigger value="moves">Moves</TabsTrigger>
        <TabsTrigger value="abilities">Abilities</TabsTrigger>
      </TabsList>
      <TabsContent value="pokedex" className="flex-1 overflow-hidden"><PokedexCompendium /></TabsContent>
      <TabsContent value="moves" className="flex-1 overflow-hidden"><MovesCompendium /></TabsContent>
      <TabsContent value="abilities" className="flex-1 overflow-hidden"><AbilitiesCompendium /></TabsContent>
    </Tabs>
  );
}

type SpeciesRow = {
  id: string; name: string; dex_number: number | null; sprite_url: string | null;
  types: PokemonType[]; base_hp: number; base_attrs: Record<string, number>;
  abilities: string[]; hidden_ability: string | null; suggested_rank: string | null;
  evolutions: string[];
};

function PokedexCompendium() {
  const [q, setQ] = useState("");
  const { data: list = [] } = useQuery({
    queryKey: ["compendium-species"],
    queryFn: async () => {
      const { data } = await supabase.from("species").select("*").order("dex_number");
      return (data ?? []) as SpeciesRow[];
    },
  });
  const filtered = list.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <Input placeholder="Search Pokémon…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-sm" />
      <div className="flex-1 overflow-y-auto space-y-2">
        {filtered.map((s) => (
          <details key={s.id} className="rounded-md border border-border bg-card">
            <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5">
              {s.sprite_url ? <img src={s.sprite_url} alt="" className="h-8 w-8 object-contain" /> : <div className="h-8 w-8 rounded bg-muted" />}
              <span className="text-xs text-muted-foreground">#{String(s.dex_number ?? 0).padStart(3, "0")}</span>
              <span className="flex-1 text-sm font-semibold">{s.name}</span>
              <div className="flex gap-0.5">
                {(s.types ?? []).map((t) => (
                  <span key={t} className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                    style={{ background: TYPE_COLORS[t]?.bg, color: TYPE_COLORS[t]?.fg }}>{t}</span>
                ))}
              </div>
            </summary>
            <div className="space-y-1.5 border-t border-border px-3 py-2 text-xs">
              <p><span className="font-semibold">Base HP:</span> {s.base_hp} · <span className="font-semibold">Suggested rank:</span> {s.suggested_rank ?? "—"}</p>
              {Object.keys(s.base_attrs ?? {}).length > 0 && (
                <p><span className="font-semibold">Base attrs:</span> {Object.entries(s.base_attrs).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
              )}
              <p><span className="font-semibold">Abilities:</span> {(s.abilities ?? []).join(", ") || "—"}
                {s.hidden_ability && <em className="text-muted-foreground"> · Hidden: {s.hidden_ability}</em>}</p>
              {(s.evolutions ?? []).length > 0 && (
                <p><span className="font-semibold">Evolutions:</span> {s.evolutions.join(" → ")}</p>
              )}
            </div>
          </details>
        ))}
        {filtered.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No species found.</p>}
      </div>
    </div>
  );
}

type MoveRow = {
  id: string; name: string; type: PokemonType; power: number; category: string; target: string;
  accuracy_stat: string | null; accuracy_skill: string | null; damage_stat: string | null; effect: string;
};

function MovesCompendium() {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { data: list = [] } = useQuery({
    queryKey: ["compendium-moves"],
    queryFn: async () => {
      const { data } = await supabase.from("moves").select("*").order("name");
      return (data ?? []) as MoveRow[];
    },
  });
  const filtered = list.filter((m) =>
    (typeFilter === "all" || m.type === typeFilter) &&
    (!q || m.name.toLowerCase().includes(q.toLowerCase()))
  );
  const grouped = POKEMON_TYPES
    .map((t) => ({ type: t, moves: filtered.filter((m) => m.type === t) }))
    .filter((g) => g.moves.length > 0);

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex gap-2">
        <Input placeholder="Search move…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 flex-1 text-sm" />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {POKEMON_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3">
        {grouped.map(({ type, moves }) => (
          <div key={type}>
            <h4 className="mb-1 inline-block rounded px-2 py-0.5 text-xs font-bold uppercase"
              style={{ background: TYPE_COLORS[type].bg, color: TYPE_COLORS[type].fg }}>{type} · {moves.length}</h4>
            <div className="grid gap-1">
              {moves.map((m) => (
                <details key={m.id} className="rounded-md border border-border bg-card">
                  <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs">
                    <span className="flex-1 font-semibold">{m.name}</span>
                    <span className="text-muted-foreground">{m.category}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5">Pwr {m.power}</span>
                  </summary>
                  <div className="space-y-0.5 border-t border-border px-3 py-2 text-xs">
                    <p><span className="font-semibold">Accuracy:</span> {m.accuracy_stat ?? "—"}{m.accuracy_skill ? ` + ${m.accuracy_skill}` : ""}</p>
                    <p><span className="font-semibold">Damage:</span> {m.damage_stat ?? "—"} · <span className="font-semibold">Target:</span> {m.target}</p>
                    {m.effect && <p className="text-muted-foreground">{m.effect}</p>}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No moves found.</p>}
      </div>
    </div>
  );
}

type AbilityRow = { id: string; name: string; effect: string };

function AbilitiesCompendium() {
  const [q, setQ] = useState("");
  const { data: list = [] } = useQuery({
    queryKey: ["compendium-abilities"],
    queryFn: async () => {
      const { data } = await supabase.from("abilities").select("*").order("name");
      return (data ?? []) as AbilityRow[];
    },
  });
  const filtered = list.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <Input placeholder="Search ability…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-sm" />
      <div className="flex-1 overflow-y-auto space-y-1">
        {filtered.map((a) => (
          <details key={a.id} className="rounded-md border border-border bg-card">
            <summary className="cursor-pointer px-3 py-1.5 text-sm font-semibold">{a.name}</summary>
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{a.effect || "—"}</p>
          </details>
        ))}
        {filtered.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No abilities.</p>}
      </div>
    </div>
  );
}
