import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ChatPanel } from "@/components/ChatPanel";

import { FloatingWindow } from "@/components/FloatingWindow";
import { OnlinePresence } from "@/components/OnlinePresence";

import { PokemonSheet } from "@/components/PokemonSheet";
import { SheetTabs } from "@/components/SheetTabs";
import { MapBoard, DRAG_MIME, type DragCharacterPayload } from "@/components/MapBoard";
import { MusicPanel } from "@/components/MusicPanel";
import { MusicPlayer } from "@/components/MusicPlayer";
import { toast } from "sonner";
import { Copy, Crown, Sparkles, User, FolderPlus, Folder, FolderOpen, Image as ImageIcon, Plus, Trash2, Swords, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Dices, Menu } from "lucide-react";
import { rollD6, rollShiny, POKEMON_TYPES, TYPE_COLORS, type PokemonType } from "@/lib/pokerole";
import { REACTION_DECK } from "@/lib/contest";

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
      // Note: invite_code is intentionally excluded — narrator fetches it via get_game_invite_code RPC.
      const { data, error } = await supabase
        .from("games")
        .select("id,narrator_id,name,background_url,created_at,system,language,narrator_type,shiny_chance,overgrown_chance,contest_weights")
        .eq("id", gameId)
        .single();
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
  const [turnOrderOpen, setTurnOrderOpen] = useState(false);

  function openWindow(w: OpenWindow) {
    if (!windows.find((x) => x.kind === w.kind && x.id === w.id)) {
      setWindows((p) => [...p, w]);
    }
  }
  function closeWindow(kind: string, id: string) {
    setWindows((p) => p.filter((x) => !(x.kind === kind && x.id === id)));
  }

  // Auto-open a sheet from a `?sheet=kind:id:label` URL param (used by the
  // "open in new window" button in floating sheets).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("sheet");
    if (!raw) return;
    const [kind, id, ...labelParts] = raw.split(":");
    if ((kind === "trainer" || kind === "pokemon") && id) {
      openWindow({ kind, id, title: decodeURIComponent(labelParts.join(":") || id) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isNarrator = !!game && !!user && game.narrator_id === user.id;

  async function rollFromSheet(
    label: string,
    n: number,
    penalty = 0,
    meta?: { characterKind: "trainer" | "pokemon"; characterId: string; imageUrl?: string | null },
  ) {
    if (!user) return;
    const result = rollD6(n);
    const adjusted = Math.max(0, result.successes - (penalty || 0));
    const finalLabel = penalty > 0 ? `${label} (−${penalty} pain)` : label;
    await supabase.from("chat_messages").insert({
      game_id: gameId, user_id: user.id, kind: "roll",
      body: finalLabel, roll_data: { ...result, successes: adjusted, penalty, label: finalLabel },
    });
    // Auto-populate Turn Order whenever an initiative roll is made
    if (meta && /initiative/i.test(label)) {
      const name = label.split("·")[0]?.trim() || label;
      await supabase
        .from("initiative")
        .delete()
        .eq("game_id", gameId)
        .eq("character_ref", meta.characterId);
      await supabase.from("initiative").insert({
        game_id: gameId,
        character_kind: meta.characterKind,
        character_ref: meta.characterId,
        character_name: name,
        image_url: meta.imageUrl ?? null,
        successes: adjusted,
        position: 0,
      });
    }
  }
  async function sendChatFromSheet(body: string) {
    if (!user || !body.trim()) return;
    await supabase.from("chat_messages").insert({
      game_id: gameId, user_id: user.id, kind: "chat", body,
    });
  }

  const { data: inviteCode } = useQuery({
    queryKey: ["invite", gameId],
    queryFn: async () => {
      if (!isNarrator) return null;
      const { data } = await supabase.rpc("get_game_invite_code", { _game: gameId });
      return (data as string | null) ?? null;
    },
    enabled: !!isNarrator,
  });
  const inviteUrl = typeof window !== "undefined" && inviteCode
    ? `${window.location.origin}/join/${inviteCode}` : "";

  // Character creation lives in <FilesPanel>.

  async function uploadBackground(file: File) {
    if (!isNarrator) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 5_000_000) {
      toast.error("Image must be under 5 MB.");
      return;
    }
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
    <div className="mx-auto grid h-[calc(100vh-4rem)] max-w-7xl grid-cols-1 gap-3 px-3 py-3 md:grid-cols-[1fr_360px]">
      <h1 className="sr-only">{game.name ? `${game.name} — D20 Project game room` : "D20 Project game room"}</h1>
      <MusicPlayer gameId={gameId} />
      {/* Center: background + characters */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="relative flex-1 min-h-0">
          <MapBoard
            gameId={gameId}
            backgroundUrl={game.background_url}
            userId={user.id}
            isNarrator={isNarrator}
            onRoll={rollFromSheet}
            onOpenSheet={(kind, id, label) => openWindow({ kind, id, title: label })}
          />
          {/* Left side disclosure (toggled like Map tools) */}
          <MapLeftDisclosure
            isNarrator={isNarrator}
            inviteUrl={inviteUrl}
            gameId={gameId}
            onToggleTurnOrder={() => setTurnOrderOpen((v) => !v)}
          />
          {/* Top "lingueta" disclosure (narrator only) */}
          {isNarrator && (
            <MapTopDisclosure
              gameId={gameId}
              currentBg={game.background_url}
              uploadBackground={uploadBackground}
            />
          )}
          <InitiativePanel gameId={gameId} isNarrator={isNarrator} open={turnOrderOpen} onClose={() => setTurnOrderOpen(false)} />
        </div>
      </div>

      {/* Right: tabs */}
      <Card className="flex min-h-0 flex-col overflow-hidden p-0">
        <div className="shrink-0 p-2">
          <OnlinePresence gameId={gameId} userId={user.id} isNarrator={isNarrator} />
        </div>
        <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col">

          <TabsList className="m-2 grid shrink-0 grid-cols-4">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="compendium">Compendium</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="music">Music</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <ChatPanel gameId={gameId} userId={user.id} aiNarrator={game.narrator_type === "ai"} isGameOwner={isNarrator} />
          </TabsContent>
          <TabsContent value="compendium" className="mt-0 min-h-0 flex-1 overflow-auto p-3">
            <CompendiumPanel />
          </TabsContent>
          <TabsContent value="files" className="mt-0 min-h-0 flex-1 overflow-auto p-3">
            <FilesPanel gameId={gameId} userId={user.id} isNarrator={isNarrator} onOpen={openWindow} />
          </TabsContent>
          <TabsContent value="music" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <MusicPanel gameId={gameId} isNarrator={isNarrator} />
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
            width={w.kind === "trainer" ? 760 : 560}
            height={640}
          >
            {w.kind === "pokemon"
              ? <PokemonSheet pokemonId={w.id} gameId={gameId} userId={user.id} isNarrator={isNarrator} onRoll={rollFromSheet} onChat={sendChatFromSheet} onDeleted={() => { closeWindow(w.kind, w.id); qc.invalidateQueries({ queryKey: ["characters", gameId] }); }} />
              : <SheetTabs trainerId={w.id} gameId={gameId} userId={user.id} isNarrator={isNarrator} onRoll={rollFromSheet} onChat={sendChatFromSheet} onDeleted={() => { closeWindow(w.kind, w.id); qc.invalidateQueries({ queryKey: ["characters", gameId] }); }} />}
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
            aria-label="Copy invite link"
            title="Copy invite link"
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
  isNarrator,
  onOpen,
}: {
  gameId: string;
  userId: string;
  isNarrator: boolean;
  onOpen: (w: OpenWindow) => void;
}) {

  const qc = useQueryClient();
  const [pkmDialogOpen, setPkmDialogOpen] = useState(false);
  const [newPkmSpecies, setNewPkmSpecies] = useState<string>("");
  const [newPkmOvergrown, setNewPkmOvergrown] = useState(false);
  const [randomOpen, setRandomOpen] = useState(false);
  const [fStarter, setFStarter] = useState(false);
  const [fFirst, setFFirst] = useState(false);
  const [fSecond, setFSecond] = useState(false);
  const [fLast, setFLast] = useState(false);
  const [fLegend, setFLegend] = useState(false);
  const [fRank, setFRank] = useState<string>("");

  const [newFolder, setNewFolder] = useState("");
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [dropHover, setDropHover] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(`folders:${gameId}`) ?? "{}"); } catch { return {}; }
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(`folders:${gameId}`, JSON.stringify(collapsed));
  }, [collapsed, gameId]);
  function toggleFolder(name: string) {
    setCollapsed((c) => ({ ...c, [name]: !c[name] }));
  }
  function toggleSelected(key: string) {
    setSelected((p) => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }
  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected sheet(s)? This cannot be undone.`)) return;
    const pkmIds: string[] = [], trIds: string[] = [];
    for (const k of selected) {
      const [kind, id] = k.split(":");
      if (kind === "pokemon") pkmIds.push(id); else if (kind === "trainer") trIds.push(id);
    }
    if (pkmIds.length) await supabase.from("pokemon").delete().in("id", pkmIds);
    if (trIds.length) await supabase.from("trainers").delete().in("id", trIds);
    setSelected(new Set()); setSelectMode(false);
    qc.invalidateQueries({ queryKey: ["characters", gameId] });
    toast.success("Deleted");
  }

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
    queryKey: ["species-list-full"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("species") as any)
        .select("id,name,evolutions,suggested_rank,is_starter,is_legendary")
        .order("dex_number");
      return (data ?? []) as Array<{
        id: string; name: string; evolutions: string[];
        suggested_rank: string | null; is_starter: boolean; is_legendary: boolean;
      }>;
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
    mutationFn: async (overrideSpeciesId?: string) => {
      const speciesId = overrideSpeciesId || newPkmSpecies;
      if (!speciesId) throw new Error("Pick a species");
      // Read configured chances from the game (defaults 10/0)
      const { data: gameRow } = await supabase
        .from("games")
        .select("shiny_chance,overgrown_chance")
        .eq("id", gameId)
        .single();
      const shinyChance = (gameRow as { shiny_chance?: number } | null)?.shiny_chance ?? 10;
      const overgrownChance = (gameRow as { overgrown_chance?: number } | null)?.overgrown_chance ?? 0;
      const isShiny = Math.floor(Math.random() * 100) + 1 <= shinyChance;
      const rolledOver = overgrownChance > 0 && Math.floor(Math.random() * 100) + 1 <= overgrownChance;
      const finalOvergrown = newPkmOvergrown || rolledOver;
      const { data, error } = await supabase
        .from("pokemon")
        .insert({
          game_id: gameId,
          owner_id: userId,
          species_id: speciesId,
          rank: "starter",
          is_shiny: isShiny,
          is_overgrown: finalOvergrown,
        })
        .select().single();
      if (error) throw error;
      if (isShiny) toast.success("✨ Shiny rolled!");
      if (rolledOver && !newPkmOvergrown) toast.success("🌿 Overgrown rolled!");
      return data;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["characters", gameId] });
      setPkmDialogOpen(false);
      setNewPkmSpecies("");
      setNewPkmOvergrown(false);
      setRandomOpen(false);
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
    const key = `${r.kind}:${r.id}`;
    const mapPayload: DragCharacterPayload = {
      kind: r.kind, id: r.id, label: r.label,
      imageUrl: r.image_url ?? (r.kind === "pokemon" ? r.sprite_url : null), ownerId: r.owner_id,
    };
    return (
      <div key={key} className="flex items-center gap-1.5">
        {selectMode && (
          <Checkbox checked={selected.has(key)} onCheckedChange={() => toggleSelected(key)} />
        )}
        <button
          draggable={!selectMode}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_MIME, JSON.stringify(mapPayload));
            e.dataTransfer.setData(FOLDER_MIME, JSON.stringify({ kind: r.kind, id: r.id, folder: r.folder }));
            e.dataTransfer.effectAllowed = "copyMove";
          }}
          onClick={() => selectMode ? toggleSelected(key) : onOpen({ kind: r.kind, id: r.id, title: r.label })}
          className={`flex w-full items-center gap-2 rounded-md border ${selected.has(key) ? "border-primary bg-primary/5" : "border-border bg-card"} px-3 py-2 text-left text-sm hover:border-primary`}
        >
          {r.kind === "pokemon" && r.sprite_url
            ? <img src={r.sprite_url} alt="" className="h-6 w-6 shrink-0" />
            : <User className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{r.label}</span>
        </button>
      </div>
    );
  }

  function FolderGroup({ name, items }: { name: string | null; items: CharRow[] }) {
    const key = name ?? "__root__";
    const isHover = dropHover === key;
    const isCollapsed = !!collapsed[key];
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
        <button
          type="button"
          onClick={() => toggleFolder(key)}
          className="mb-1.5 flex w-full items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <span className="inline-block w-3 text-center">{isCollapsed ? "▸" : "▾"}</span>
          {name ? <Folder className="h-3.5 w-3.5" /> : <FolderOpen className="h-3.5 w-3.5" />}
          {name ?? "Unfiled"}
          <span className="ml-1 text-[10px] opacity-60">({items.length})</span>
        </button>
        {!isCollapsed && (
          <div className="space-y-1.5">
            {items.map(renderItem)}
            {items.length === 0 && (
              <p className="px-2 py-1 text-[11px] text-muted-foreground">Drop a sheet here.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Characters</h3>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => createTrainer.mutate()}>
            <User className="mr-1 h-3.5 w-3.5" /> Trainer
          </Button>
          <Dialog open={pkmDialogOpen} onOpenChange={setPkmDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Sparkles className="mr-1 h-3.5 w-3.5" /> Pokémon</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create a Pokémon</DialogTitle></DialogHeader>
              <div className="flex items-center justify-between">
                <Label>Species</Label>
                <Button size="sm" variant="outline" onClick={() => setRandomOpen((v) => !v)}>
                  <Dices className="mr-1 h-3.5 w-3.5" /> Aleatório
                </Button>
              </div>
              <Select value={newPkmSpecies} onValueChange={setNewPkmSpecies}>
                <SelectTrigger><SelectValue placeholder="Pick a species" /></SelectTrigger>
                <SelectContent>
                  {speciesList?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {randomOpen && (() => {
                const list = speciesList ?? [];
                const parentOf = new Map<string, string>();
                for (const s of list) for (const ev of (s.evolutions ?? [])) parentOf.set(ev, s.name);
                const isMegaName = (n: string) => /\bMega\b/.test(n);
                const allMega = (evos: string[]) => evos.length > 0 && evos.every(isMegaName);
                function matches(s: typeof list[number]): boolean {
                  const hasParent = parentOf.has(s.name);
                  const evos = s.evolutions ?? [];
                  const rank = s.suggested_rank;
                  const proPlus = rank === "pro" || rank === "master";
                  const cats: boolean[] = [];
                  if (fStarter) cats.push(!!s.is_starter);
                  if (fLegend) cats.push(!!s.is_legendary);
                  if (fFirst) cats.push(!s.is_legendary && !proPlus && (!hasParent || evos.length === 0));
                  if (fSecond) cats.push(!s.is_legendary && !proPlus && hasParent && evos.length > 0 && !allMega(evos));
                  if (fLast) cats.push(!s.is_legendary && rank !== "master" && hasParent && (evos.length === 0 || allMega(evos)));
                  const catMatch = cats.length === 0 ? true : cats.some(Boolean);
                  const rankMatch = !fRank || s.suggested_rank === fRank;
                  return catMatch && rankMatch;
                }
                function roll() {
                  const pool = list.filter(matches);
                  if (pool.length === 0) { toast.error("Nenhum Pokémon corresponde aos filtros"); return; }
                  const pick = pool[Math.floor(Math.random() * pool.length)];
                  toast.success(`🎲 ${pick.name}`);
                  createPokemon.mutate(pick.id);
                }
                return (
                  <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2.5 text-xs">
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="flex items-center gap-1.5"><Checkbox checked={fStarter} onCheckedChange={(v) => setFStarter(!!v)} /> Starter</label>
                      <label className="flex items-center gap-1.5"><Checkbox checked={fLegend} onCheckedChange={(v) => setFLegend(!!v)} /> Lendário</label>
                      <label className="flex items-center gap-1.5"><Checkbox checked={fFirst} onCheckedChange={(v) => setFFirst(!!v)} /> Estágio inicial</label>
                      <label className="flex items-center gap-1.5"><Checkbox checked={fSecond} onCheckedChange={(v) => setFSecond(!!v)} /> Segundo estágio</label>
                      <label className="flex items-center gap-1.5"><Checkbox checked={fLast} onCheckedChange={(v) => setFLast(!!v)} /> Último estágio</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap">Rank recomendado:</span>
                      <Select value={fRank || "any"} onValueChange={(v) => setFRank(v === "any" ? "" : v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Qualquer</SelectItem>
                          <SelectItem value="starter">Starter</SelectItem>
                          <SelectItem value="beginner">Beginner</SelectItem>
                          <SelectItem value="amateur">Amateur</SelectItem>
                          <SelectItem value="ace">Ace</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="master">Master</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" className="w-full" onClick={roll}>
                      <Dices className="mr-1 h-3.5 w-3.5" /> Sortear
                    </Button>
                  </div>
                );
              })()}
              <label className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-sm">
                <Checkbox
                  checked={newPkmOvergrown}
                  onCheckedChange={(v) => setNewPkmOvergrown(!!v)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Overgrown</span>
                  <span className="block text-xs text-muted-foreground">
                    Pokémon raro com vitalidade superior. HP base +1.
                  </span>
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                Chances de shiny/overgrown configuráveis em ⚙️ Settings.
              </p>
              <DialogFooter>
                <Button onClick={() => createPokemon.mutate(undefined)} disabled={createPokemon.isPending}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {!selectMode ? (
            <Button size="sm" variant="outline" onClick={() => setSelectMode(true)}>Select</Button>
          ) : (
            <>
              <Button size="sm" variant="destructive" disabled={selected.size === 0} onClick={bulkDelete}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete ({selected.size})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setSelectMode(false); setSelected(new Set()); }}>Cancel</Button>
            </>
          )}
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
    <Tabs defaultValue="mechanics" className="flex h-full flex-col">
      <TabsList className="grid grid-cols-4">
        <TabsTrigger value="mechanics">Rules</TabsTrigger>
        <TabsTrigger value="pokedex">Pokédex</TabsTrigger>
        <TabsTrigger value="moves">Moves</TabsTrigger>
        <TabsTrigger value="abilities">Abilities</TabsTrigger>
      </TabsList>
      <TabsContent value="mechanics" className="flex-1 overflow-hidden"><MechanicsCompendium /></TabsContent>
      <TabsContent value="pokedex" className="flex-1 overflow-hidden"><PokedexCompendium /></TabsContent>
      <TabsContent value="moves" className="flex-1 overflow-hidden"><MovesCompendium /></TabsContent>
      <TabsContent value="abilities" className="flex-1 overflow-hidden"><AbilitiesCompendium /></TabsContent>
    </Tabs>
  );
}

const MECHANICS: { title: string; body: string }[] = [
  {
    title: "Dice & Successes",
    body:
      "Pokérole 2.0 uses pools of d6. Each die showing 4, 5 or 6 counts as 1 success. " +
      "Build a pool by adding the relevant Attribute + Skill (or Attribute + Attribute) " +
      "and roll that many d6s. Compare successes against a difficulty (1–5) or against " +
      "an opposing roll. Ties favor the defender.",
  },
  {
    title: "Action Economy (Round)",
    body:
      "On a round every character may take ONE main action (move + attack, or a full action " +
      "like Defend, Help, use an item). Initiative = Dexterity + Alert. Movement is " +
      "narrative — describe distance in close / nearby / far. Free actions (1‑word shouts, " +
      "drop an item) don't cost the round.",
  },
  {
    title: "Combat — Accuracy & Damage",
    body:
      "Attack roll = (Accuracy Attribute) + (Accuracy Skill). Each success beyond the " +
      "defender's Evasion (Dex + Evasion) lands the hit. Damage roll = (Damage Stat) + " +
      "(Move Power) in d6. Subtract the target's Defense (Vitality, or Special for Special " +
      "moves) from successes; remainder = HP lost. STAB grants +1 die when the move type " +
      "matches a type of the user.",
  },
  {
    title: "Pain Penalty",
    body:
      "Track current HP vs max. At ≤ half max HP every roll loses 1 success (pain penalty 1). " +
      "At 1 HP remaining the penalty becomes 2. Reaching 0 HP knocks the character out.",
  },
  {
    title: "Will & Mental Effects",
    body:
      "Will = Insight + 2 (max). Spend Will to use Channel-based abilities, resist mental " +
      "moves, or push through fear/charm/confusion. Restore Will by resting, eating a meal, " +
      "or scenes of camaraderie.",
  },
  {
    title: "Confidence & Loyalty",
    body:
      "Pokémon track Happiness, Loyalty and Confidence (0–5). Confidence is spent like Will " +
      "to re-roll one die or shrug off a status. Build it through victories, training and " +
      "respecting the Pokémon's Nature; lose it from defeat or mistreatment.",
  },
  {
    title: "Status Conditions",
    body:
      "Burn: lose 1 HP at round start, −1 Strength. Poison: 1 HP/round, doubles after the " +
      "third round. Paralyzed: lose 1 die from Dexterity pools. Sleep / Frozen: skip turn, " +
      "wake on damage. Confused: roll d6 — on 1‑2 attack a random target. Flinched: skip " +
      "the next action. Remove with rest, items or healing moves.",
  },
  {
    title: "Ranks",
    body:
      "Starter → Beginner → Amateur → Ace → Pro → Master. Rank caps attributes & skills " +
      "and unlocks new moves. Players advance by completing significant story beats — not by " +
      "XP grinding. The Narrator decides when the party gains a Rank.",
  },
  {
    title: "Move Learning Cap",
    body:
      "A Pokémon knows at most (Insight + 2) moves at a time. To learn a new move beyond " +
      "the cap you must forget one. Trainers also cap their battle techniques the same way.",
  },
  {
    title: "Evolution",
    body:
      "Evolve when at the required Rank (or holding the right item/stone) and after a " +
      "meaningful narrative moment. Evolving raises Base HP and one Attribute cap. A Pokémon " +
      "may refuse evolution — Loyalty rolls decide.",
  },
  {
    title: "Z-Moves & Dynamax",
    body:
      "Z-Move: once per scene, transform one damaging move into its Z-form (renamed by type, " +
      "Power +5/+4/+3/+2 by bracket). Dynamax: HP ×2 for 3 rounds; physical/special moves " +
      "become Max-moves. Gigantamax: as Dynamax but the species gets a unique G-Max move " +
      "(Power +3 of the base) — only species with a G-Max form.",
  },
  {
    title: "Social / Contest Stats",
    body:
      "Tough · Cool · Beautiful · Cute · Clever. Used for Contests, performances, and " +
      "social conflict (combined with skills like Allure, Perform, Etiquette, Intimidate). " +
      "Same d6-success mechanics as combat.",
  },
  {
    title: "Skills",
    body:
      "Trainer skills include Brawl, Throw, Weapons (attack rolls use Dex + one of these). " +
      "Pokémon attack with Brawl or Channel + Dexterity. Shared skills: Clash, Evasion, " +
      "Alert, Athletic, Nature, Stealth, Allure, Etiquette, Intimidate, Perform, Crafts, " +
      "Lore, Medicine, Science, Empathy. Cap = current Rank tier.",
  },
  {
    title: "Healing & Items",
    body:
      "Potion +2 HP, Super +4, Hyper +6, Max heals to full. Battle Items (X Attack, X Def…) " +
      "give +1 to that stat's rolls until end of scene. Items are limited per fight — track " +
      "your bag and battle pouch on the sheet.",
  },
];

function MechanicsCompendium() {
  const [q, setQ] = useState("");
  const filtered = MECHANICS.filter(
    (m) => !q || m.title.toLowerCase().includes(q.toLowerCase()) || m.body.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <Input placeholder="Search rules…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-sm" />
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {filtered.map((m) => (
          <details key={m.title} className="rounded-md border border-border bg-card">
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">{m.title}</summary>
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{m.body}</p>
          </details>
        ))}
        {filtered.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No matches.</p>}
      </div>
    </div>
  );
}

// ============================================================
// Initiative panel — auto-shows whenever combat is active
// ============================================================

type InitRow = {
  id: string; game_id: string; character_name: string; character_kind: string;
  character_ref: string | null; successes: number; position: number; image_url: string | null;
};

function InitiativePanel({ gameId, isNarrator, open, onClose }: { gameId: string; isNarrator: boolean; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["initiative", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("initiative").select("*").eq("game_id", gameId)
        .order("position", { ascending: true })
        .order("successes", { ascending: false })
        .order("created_at", { ascending: true });
      return (data ?? []) as InitRow[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`initiative:${gameId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "initiative", filter: `game_id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ["initiative", gameId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [gameId, qc]);

  if (!open) return null;

  async function clearInit() {
    if (!confirm("End combat and clear the turn order?")) return;
    await supabase.from("initiative").delete().eq("game_id", gameId);
  }

  async function nextTurn() {
    if (rows.length < 2) return;
    const top = rows[0];
    const maxPos = rows.reduce((m, r) => Math.max(m, r.position ?? 0), 0);
    await supabase.from("initiative").update({ position: maxPos + 1 }).eq("id", top.id);
    qc.invalidateQueries({ queryKey: ["initiative", gameId] });
  }

  return (
    <FloatingWindow
      title="Turn Order"
      onClose={onClose}
      initialX={typeof window !== "undefined" ? window.innerWidth - 320 : 800}
      initialY={80}
      width={280}
      height={420}
      minWidth={240}
      minHeight={160}
    >
      <div className="p-3">
        {rows.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center justify-end gap-1">
            <Button size="sm" variant="default" className="h-7 text-xs" onClick={nextTurn} disabled={rows.length < 2} title="Próximo turno">
              <ChevronRight className="mr-1 h-3 w-3" /> Próximo turno
            </Button>
            {isNarrator && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearInit} title="End combat">
                <Trash2 className="mr-1 h-3 w-3" /> End combat
              </Button>
            )}
          </div>
        )}
        {rows.length === 0 ? (
          <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">
            Sem rolagens de iniciativa ainda. Clique em <em>Initiative</em> em uma ficha ou na ação rápida do token para entrar na ordem.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {rows.map((r, i) => (
              <li
                key={r.id}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${i === 0 ? "bg-primary/15 font-semibold" : "bg-muted/50"}`}
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background text-[10px]">{i + 1}</span>
                {r.image_url ? (
                  <img src={r.image_url} alt="" className="h-7 w-7 shrink-0 rounded-full border border-border object-cover" />
                ) : (
                  <div className="h-7 w-7 shrink-0 rounded-full bg-background" />
                )}
                <span className="flex-1 truncate">{r.character_name}</span>
                <span className="text-muted-foreground">{r.successes} ✦</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </FloatingWindow>
  );
}

// Top "lingueta" disclosure — collapsed by default; click to reveal scenario controls.
function MapTopDisclosure({
  gameId,
  currentBg,
  uploadBackground,
}: {
  gameId: string;
  currentBg: string | null;
  uploadBackground: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-auto absolute left-1/2 top-0 z-10 flex -translate-x-1/2 flex-col items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-b-lg bg-card/95 px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow backdrop-blur hover:text-foreground"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Map tools
      </button>
      {open && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 rounded-lg border border-border bg-card/95 p-2 shadow-lg backdrop-blur">
          <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-semibold hover:bg-accent">
            <ImageIcon className="h-3.5 w-3.5" /> Set background
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadBackground(e.target.files[0])} />
          </label>
          <ScenarioButtons gameId={gameId} currentBg={currentBg} />
        </div>
      )}
    </div>
  );
}


function MapLeftDisclosure({
  isNarrator,
  inviteUrl,
  gameId,
  onToggleTurnOrder,
}: {
  isNarrator: boolean;
  inviteUrl: string;
  gameId: string;
  onToggleTurnOrder: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-auto absolute left-0 top-3 z-10 flex items-start">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-r-lg bg-card/95 px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow backdrop-blur hover:text-foreground"
        title={open ? "Hide menu" : "Show menu"}
      >
        <Menu className="h-3.5 w-3.5" />
        {open ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="ml-1 flex flex-col gap-2 rounded-lg border border-border bg-card/95 p-2 shadow-lg backdrop-blur">
          {isNarrator && (
            <span className="inline-flex items-center justify-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase text-primary-foreground shadow">
              <Crown className="h-3 w-3" /> Narrator
            </span>
          )}
          {isNarrator && <InviteButton url={inviteUrl} />}
          {isNarrator && <GameSettingsButton gameId={gameId} />}
          <Button
            size="sm"
            variant="secondary"
            className="h-8 justify-start"
            onClick={onToggleTurnOrder}
          >
            <Swords className="mr-1 h-3.5 w-3.5" /> Turn Order
          </Button>
        </div>
      )}
    </div>
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

function GameSettingsButton({ gameId }: { gameId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [shiny, setShiny] = useState<number>(10);
  const [over, setOver] = useState<number>(0);
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const c of REACTION_DECK) m[c.id] = c.defaultWeight;
    return m;
  });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("games")
        .select("shiny_chance,overgrown_chance,contest_weights")
        .eq("id", gameId)
        .single();
      const row = data as { shiny_chance?: number; overgrown_chance?: number; contest_weights?: Record<string, number> | null } | null;
      setShiny(row?.shiny_chance ?? 10);
      setOver(row?.overgrown_chance ?? 0);
      const w: Record<string, number> = {};
      for (const c of REACTION_DECK) w[c.id] = row?.contest_weights?.[c.id] ?? c.defaultWeight;
      setWeights(w);
    })();
  }, [open, gameId]);

  const weightTotal = REACTION_DECK.reduce((s, c) => s + (weights[c.id] ?? 0), 0);

  async function save() {
    const s = Math.max(0, Math.min(100, Math.round(shiny)));
    const o = Math.max(0, Math.min(100, Math.round(over)));
    const cw: Record<string, number> = {};
    for (const c of REACTION_DECK) cw[c.id] = Math.max(0, Math.min(100, Math.round(weights[c.id] ?? 0)));
    const { error } = await supabase
      .from("games")
      .update({ shiny_chance: s, overgrown_chance: o, contest_weights: cw } as never)
      .eq("id", gameId);
    if (error) { toast.error(error.message); return; }
    toast.success("Configurações salvas");
    qc.invalidateQueries({ queryKey: ["game", gameId] });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="h-8 justify-start">⚙️ Settings</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Configurações do Jogo</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Chance de Shiny (%)</Label>
              <Input type="number" min={0} max={100} value={shiny} onChange={(e) => setShiny(Number(e.target.value))} />
              <p className="mt-1 text-[11px] text-muted-foreground">Aplicada ao criar um Pokémon novo.</p>
            </div>
            <div>
              <Label className="text-xs">Chance de Overgrown (%)</Label>
              <Input type="number" min={0} max={100} value={over} onChange={(e) => setOver(Number(e.target.value))} />
              <p className="mt-1 text-[11px] text-muted-foreground">0 = só manual (checkbox na criação).</p>
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wider">Contest · Reaction deck weights</Label>
              <span className={`text-[11px] tabular-nums ${weightTotal === 100 ? "text-muted-foreground" : "text-amber-500"}`}>
                Total {weightTotal}%
              </span>
            </div>
            <div className="space-y-1.5 rounded-md border border-border bg-card p-2">
              {REACTION_DECK.map((c) => (
                <div key={c.id} className="grid grid-cols-[1fr_5rem] items-center gap-2">
                  <span className="text-xs">
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-1 text-muted-foreground">· {c.hearts > 0 ? `+${c.hearts}` : c.hearts} ♥</span>
                  </span>
                  <Input
                    type="number" min={0} max={100}
                    value={weights[c.id] ?? 0}
                    onChange={(e) => setWeights((w) => ({ ...w, [c.id]: Number(e.target.value) }))}
                    className="h-7 text-center text-xs"
                  />
                </div>
              ))}
              <p className="px-1 pt-1 text-[11px] text-muted-foreground">
                Ajuste pesos por carta. Em branco/0 = nunca sai. Booing não é sorteado — ocorre em falha.
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
