import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabase-paged";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { ImageSourceDialog } from "@/components/ImageSourceDialog";
import { ChatPanel } from "@/components/ChatPanel";
import { useGameSpdefUsesInsight } from "@/hooks/use-game-spdef-uses-insight";

import { FloatingWindow } from "@/components/FloatingWindow";
import { OnlinePresence } from "@/components/OnlinePresence";

import { PokemonSheet } from "@/components/PokemonSheet";
import { SheetTabs } from "@/components/SheetTabs";
import { MapBoard, DRAG_MIME, type DragCharacterPayload } from "@/components/MapBoard";
import { MacroBar } from "@/components/MacroBar";
import { MusicPanel } from "@/components/MusicPanel";
import { MusicPlayer } from "@/components/MusicPlayer";
import { toast } from "sonner";
import { Copy, Crown, Sparkles, User, FolderPlus, Folder, FolderOpen, Image as ImageIcon, Plus, Trash2, Swords, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Dices, Menu, ZoomIn, ZoomOut, RotateCcw, MessageSquare } from "lucide-react";
import { rollD6, rollShiny, POKEMON_ATTRS, SOCIAL_ATTRS, POKEMON_TYPES, RANKS, RANK_LABELS, TYPE_COLORS, type PokemonType, type Rank } from "@/lib/pokerole";
import { rollPokemonAutofill } from "@/lib/pokemon-autofill";
import { REACTION_DECK } from "@/lib/contest";

const BIOME_LABELS: Record<string, string> = {
  cave: "Caverna",
  forest: "Floresta",
  grassland: "Campo",
  mountain: "Montanha",
  rare: "Rara/Lendária",
  "rough-terrain": "Terreno acidentado",
  sea: "Mar",
  urban: "Urbano",
  "waters-edge": "Margem d'água",
};
const BIOME_KEYS = Object.keys(BIOME_LABELS);

export const Route = createFileRoute("/_app/games/$gameId")({
  component: GameRoom,
});

type OpenWindow =
  | { kind: "pokemon"; id: string; title: string }
  | { kind: "trainer"; id: string; title: string };

function GameRoom() {
  const { gameId } = Route.useParams();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<string>("map");
  const qc = useQueryClient();

  const { data: game, error: gameError, isLoading: gameLoading } = useQuery({
    queryKey: ["game", gameId],
    queryFn: async () => {
      // Note: invite_code is intentionally excluded — narrator fetches it via get_game_invite_code RPC.
      const { data, error } = await supabase
        .from("games")
        .select("id,narrator_id,name,background_url,created_at,system,language,narrator_type,shiny_chance,overgrown_chance,contest_weights,grid_enabled,grid_snap,grid_snap_mode,grid_size,grid_color,grid_opacity,grid_unit_m,grid_unit_label,fog_enabled,dynamic_lighting,master_volume,current_scenario_id,active_page_id")
        .eq("id", gameId)
        .single();
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  // Character list lives in <FilesPanel>.

  const { data: speciesList } = useQuery({
    queryKey: ["species-list"],
    queryFn: async () => {
      return await fetchAllPaged<{ id: string; name: string }>(
        "species",
        "id,name",
        { orderBy: "dex_number", ascending: true },
      );
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
    // Pain penalty reduces the dice pool, NOT successes.
    const finalPool = Math.max(0, n - (penalty || 0));
    const result = rollD6(finalPool);
    const finalLabel = penalty > 0 ? `${label} (pool ${n}−${penalty} pain)` : label;
    await supabase.from("chat_messages").insert({
      game_id: gameId, user_id: user.id, kind: "roll",
      body: finalLabel, roll_data: { ...result, pool: finalPool, originalPool: n, penalty, label: finalLabel },
    });
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
        successes: result.successes,
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

  async function setBackgroundUrl(url: string) {
    if (!isNarrator) return;
    await supabase.from("games").update({ background_url: url }).eq("id", gameId);
    qc.invalidateQueries({ queryKey: ["game", gameId] });
  }


  if (gameError) return (
    <div className="p-8 max-w-2xl mx-auto">
      <h2 className="text-lg font-bold text-destructive mb-2">Erro ao carregar o jogo</h2>
      <pre className="text-xs bg-muted p-3 rounded whitespace-pre-wrap break-words">{(gameError as Error)?.message || String(gameError)}</pre>
      <p className="text-sm text-muted-foreground mt-3">Causa provável: você não é membro deste jogo, ou uma coluna foi removida. Volte ao dashboard e tente novamente.</p>
    </div>
  );
  if (gameLoading || !game || !user) return <div className="p-8 text-sm text-muted-foreground">Carregando jogo…</div>;

  const mapBoard = (
    <MapBoard
      gameId={gameId}
      backgroundUrl={game.background_url}
      userId={user.id}
      isNarrator={isNarrator}
      activePageId={(game as never as { active_page_id?: string | null }).active_page_id ?? null}
      onRoll={rollFromSheet}
      onOpenSheet={(kind, id, label) => openWindow({ kind, id, title: label })}
      gridSettings={{
        enabled: (game as never as { grid_enabled?: boolean }).grid_enabled ?? true,
        snap: (game as never as { grid_snap?: boolean }).grid_snap ?? true,
        snapMode: ((game as never as { grid_snap_mode?: string }).grid_snap_mode as "center" | "line" | "free" | undefined) ?? "center",
        size: (game as never as { grid_size?: number }).grid_size ?? 56,
        color: (game as never as { grid_color?: string }).grid_color ?? "#000000",
        opacity: (game as never as { grid_opacity?: number }).grid_opacity ?? 30,
        unitMeters: Number((game as never as { grid_unit_m?: number }).grid_unit_m ?? 1.5),
        unitLabel: (game as never as { grid_unit_label?: string }).grid_unit_label ?? "m",
      }}
      visibility={{
        fogEnabled: (game as never as { fog_enabled?: boolean }).fog_enabled ?? false,
        dynamicLighting: (game as never as { dynamic_lighting?: boolean }).dynamic_lighting ?? false,
      }}
    />
  );

  const sheetWindows = (
    <div className="pointer-events-none">
      {windows.map((w, i) => (
        <FloatingWindow
          key={`${w.kind}-${w.id}`}
          title={w.title}
          onClose={() => closeWindow(w.kind, w.id)}
          onPopOut={() => {
            const params = new URLSearchParams();
            params.set("sheet", `${w.kind}:${w.id}:${encodeURIComponent(w.title)}`);
            const url = `${window.location.pathname}?${params.toString()}`;
            window.open(url, "_blank", "noopener,width=1200,height=800");
          }}
          initialX={isMobile ? 8 : 120 + i * 30}
          initialY={isMobile ? 56 : 80 + i * 30}
          width={isMobile ? Math.min(window.innerWidth - 16, 480) : (w.kind === "trainer" ? 760 : 560)}
          height={isMobile ? Math.min(window.innerHeight - 80, 700) : 640}
        >
          {w.kind === "pokemon"
            ? <PokemonSheet pokemonId={w.id} gameId={gameId} userId={user.id} isNarrator={isNarrator} onRoll={rollFromSheet} onChat={sendChatFromSheet} onDeleted={() => { closeWindow(w.kind, w.id); qc.invalidateQueries({ queryKey: ["characters", gameId] }); }} />
            : <SheetTabs trainerId={w.id} gameId={gameId} userId={user.id} isNarrator={isNarrator} onRoll={rollFromSheet} onChat={sendChatFromSheet} onDeleted={() => { closeWindow(w.kind, w.id); qc.invalidateQueries({ queryKey: ["characters", gameId] }); }} />}
        </FloatingWindow>
      ))}
    </div>
  );

  if (isMobile) {
    const baseTabs = ["map", "chat", "compendium", "files", "music"] as const;
    type BaseTab = (typeof baseTabs)[number];
    const sheetTabKey = (w: OpenWindow) => `sheet:${w.kind}:${w.id}`;
    const isSheetTab = mobileTab.startsWith("sheet:");
    const activeSheet = isSheetTab ? windows.find((w) => sheetTabKey(w) === mobileTab) ?? null : null;

    // If user opened a sheet from another tab, auto-switch to its tab.
    // If the active sheet was closed, fall back to map.
    function onClickBaseTab(t: BaseTab) {
      // Switching to a base tab closes any open sheet tabs (as requested).
      if (windows.length > 0) setWindows([]);
      setMobileTab(t);
    }

    const openWindowMobile = (w: OpenWindow) => {
      openWindow(w);
      setMobileTab(sheetTabKey(w));
    };

    return (
      <div className="relative flex h-[calc(100vh-4rem)] w-full flex-col">
        <h1 className="sr-only">{game.name ? `${game.name} — D20 Project game room` : "D20 Project game room"}</h1>
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-card p-1">
          {baseTabs.map((t) => (
            <button
              key={t}
              onClick={() => onClickBaseTab(t)}
              className={`shrink-0 rounded-md px-2 py-2 text-xs font-bold uppercase ${mobileTab === t ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
            >
              {t === "map" ? "Mapa" : t === "chat" ? "Chat" : t === "compendium" ? "Compendium" : t === "files" ? "Files" : "Música"}
            </button>
          ))}
          {windows.map((w) => {
            const key = sheetTabKey(w);
            return (
              <button
                key={key}
                onClick={() => setMobileTab(key)}
                className={`group flex shrink-0 items-center gap-1 rounded-md px-2 py-2 text-xs font-bold uppercase ${mobileTab === key ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
                title={w.title}
              >
                <span className="max-w-[7rem] truncate">{w.title}</span>
                <span
                  role="button"
                  aria-label="Fechar ficha"
                  className="rounded p-0.5 opacity-70 hover:bg-background/30 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeWindow(w.kind, w.id);
                    if (mobileTab === key) setMobileTab("map");
                  }}
                >×</span>
              </button>
            );
          })}
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className={`absolute inset-0 ${mobileTab === "map" ? "" : "hidden"}`}>
            {mapBoard}
            <MapLeftDisclosure
              isNarrator={isNarrator}
              inviteUrl={inviteUrl}
              gameId={gameId}
              onToggleTurnOrder={() => setTurnOrderOpen((v) => !v)}
            />
            {isNarrator && (
              <MapTopDisclosure
                gameId={gameId}
                currentBg={game.background_url}
                setBackgroundUrl={setBackgroundUrl}
              />
            )}
            <InitiativePanel gameId={gameId} isNarrator={isNarrator} open={turnOrderOpen} onClose={() => setTurnOrderOpen(false)} />
            <MacroBar gameId={gameId} userId={user.id} />
          </div>
          {mobileTab === "chat" && (
            <div className="h-full overflow-hidden">
              <div className="p-2"><OnlinePresence gameId={gameId} userId={user.id} isNarrator={isNarrator} /></div>
              <ChatPanel gameId={gameId} userId={user.id} aiNarrator={game.narrator_type === "ai"} isGameOwner={isNarrator} />
            </div>
          )}
          {mobileTab === "compendium" && (
            <div className="h-full overflow-auto p-3"><CompendiumPanel /></div>
          )}
          {mobileTab === "files" && (
            <div className="h-full overflow-auto p-3">
              <FilesPanel gameId={gameId} userId={user.id} isNarrator={isNarrator} onOpen={openWindowMobile} isMobile />
            </div>
          )}
          {mobileTab === "music" && (
            <div className="h-full overflow-hidden">
              <MusicPanel gameId={gameId} isNarrator={isNarrator} />
            </div>
          )}
          {activeSheet && (
            <div className="absolute inset-0 overflow-auto bg-background">
              {activeSheet.kind === "pokemon"
                ? <PokemonSheet pokemonId={activeSheet.id} gameId={gameId} userId={user.id} isNarrator={isNarrator} onRoll={rollFromSheet} onChat={sendChatFromSheet} onDeleted={() => { closeWindow(activeSheet.kind, activeSheet.id); setMobileTab("map"); qc.invalidateQueries({ queryKey: ["characters", gameId] }); }} />
                : <SheetTabs trainerId={activeSheet.id} gameId={gameId} userId={user.id} isNarrator={isNarrator} onRoll={rollFromSheet} onChat={sendChatFromSheet} onDeleted={() => { closeWindow(activeSheet.kind, activeSheet.id); setMobileTab("map"); qc.invalidateQueries({ queryKey: ["characters", gameId] }); }} />}
            </div>
          )}
        </div>
        <MusicPlayer gameId={gameId} />
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full px-3 py-3">
      <h1 className="sr-only">{game.name ? `${game.name} — D20 Project game room` : "D20 Project game room"}</h1>
      <MusicPlayer gameId={gameId} />
      {/* Fullscreen map */}
      <div className="relative h-full w-full">
        {mapBoard}
        <MapLeftDisclosure
          isNarrator={isNarrator}
          inviteUrl={inviteUrl}
          gameId={gameId}
          onToggleTurnOrder={() => setTurnOrderOpen((v) => !v)}
        />
        {isNarrator && (
          <MapTopDisclosure
            gameId={gameId}
            currentBg={game.background_url}
            setBackgroundUrl={setBackgroundUrl}
          />
        )}
        <InitiativePanel gameId={gameId} isNarrator={isNarrator} open={turnOrderOpen} onClose={() => setTurnOrderOpen(false)} />
        <MacroBar gameId={gameId} userId={user.id} />

        {/* Right: floating chat/files/etc overlay */}
        <RightOverlayPanel>
          <Card className="flex h-full min-h-0 flex-col overflow-hidden p-0">
            <div className="shrink-0 p-2">
              <OnlinePresence gameId={gameId} userId={user.id} isNarrator={isNarrator} />
            </div>
            <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="m-2 grid shrink-0 grid-cols-4">
                <TabsTrigger value="chat">Chat</TabsTrigger>
                <TabsTrigger value="compendium">Compendium</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="music">Música</TabsTrigger>
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
        </RightOverlayPanel>
      </div>

      {sheetWindows}
    </div>
  );
}

function RightOverlayPanel({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(360);
  const dragRef = useRef<{ mx: number; ow: number } | null>(null);
  useEffect(() => {
    function move(e: MouseEvent) {
      if (dragRef.current) {
        const next = dragRef.current.ow - (e.clientX - dragRef.current.mx);
        setWidth(Math.max(280, Math.min(640, next)));
      }
    }
    function up() { dragRef.current = null; }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);
  return (
    <div className="pointer-events-none absolute right-3 top-3 bottom-3 z-30 flex items-start gap-1">
      {open && (
        <div
          className="pointer-events-auto relative h-full"
          style={{ width }}
        >
          <div
            className="absolute -left-1 top-0 bottom-0 z-10 w-1.5 cursor-ew-resize bg-transparent hover:bg-primary/40"
            onMouseDown={(e) => { dragRef.current = { mx: e.clientX, ow: width }; e.preventDefault(); }}
            title="Drag to resize"
          />
          <div className="h-full opacity-95">{children}</div>
        </div>
      )}
      <button
        className="pointer-events-auto mt-1 rounded-l-md bg-card/95 px-1.5 py-2 text-xs shadow backdrop-blur hover:bg-accent"
        onClick={() => setOpen((v) => !v)}
        title={open ? "Hide panel" : "Show panel"}
      >
        {open ? <ChevronRight className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
      </button>
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
const FOLDER_PATH_MIME = "application/x-pokerole-folder-path";

type FolderNode = {
  path: string;      // full path, e.g. "Region/City"
  name: string;      // last segment, e.g. "City"
  items: CharRow[];
  children: FolderNode[];
};

function buildFolderTree(paths: string[], rows: CharRow[], order: Record<string, number> = {}): FolderNode[] {
  // Ensure all ancestors exist
  const expanded = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      expanded.add(parts.slice(0, i).join("/"));
    }
  }
  const root: FolderNode[] = [];
  const byPath = new Map<string, FolderNode>();
  const sorted = Array.from(expanded).sort();
  for (const path of sorted) {
    const parts = path.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const node: FolderNode = { path, name, items: [], children: [] };
    byPath.set(path, node);
    if (parentPath) {
      const parent = byPath.get(parentPath);
      if (parent) parent.children.push(node);
      else root.push(node);
    } else {
      root.push(node);
    }
  }
  for (const r of rows) {
    if (!r.folder) continue;
    const node = byPath.get(r.folder);
    if (node) node.items.push(r);
  }
  const cmp = (a: FolderNode, b: FolderNode) => {
    const oa = order[a.path] ?? Number.MAX_SAFE_INTEGER;
    const ob = order[b.path] ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name);
  };
  const sortRec = (nodes: FolderNode[]) => {
    nodes.sort(cmp);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(root);
  return root;
}

function FilesPanel({
  gameId,
  userId,
  isNarrator,
  onOpen,
  isMobile = false,
}: {
  gameId: string;
  userId: string;
  isNarrator: boolean;
  onOpen: (w: OpenWindow) => void;
  isMobile?: boolean;
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
  const [randomGenRank, setRandomGenRank] = useState<Rank>("starter");
  const [randomMode, setRandomMode] = useState<"catalog" | "route" | "biome">("catalog");
  const [selectedBiome, setSelectedBiome] = useState<string>("forest");
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  // Route management (narrator only)
  const [routeMgrOpen, setRouteMgrOpen] = useState(false);
  const [newRouteName, setNewRouteName] = useState("");
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [editingRouteSpecies, setEditingRouteSpecies] = useState<string[]>([]);
  const [routeSpeciesPick, setRouteSpeciesPick] = useState<string>("");

  const { data: routes, refetch: refetchRoutes } = useQuery({
    queryKey: ["routes", gameId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("routes" as any) as any)
        .select("id,name,species_ids,default_rank")
        .eq("game_id", gameId)
        .order("created_at");
      return (data ?? []) as { id: string; name: string; species_ids: string[]; default_rank: Rank }[];
    },
  });

  const { data: speciesWithBiomes } = useQuery({
    queryKey: ["species-biomes"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("species") as any)
        .select("id,name,biomes,suggested_rank")
        .order("dex_number");
      return (data ?? []) as { id: string; name: string; biomes: string[]; suggested_rank: string | null }[];
    },
  });


  const [newFolder, setNewFolder] = useState("");
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [dropHover, setDropHover] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<{ row: CharRow; x: number; y: number; mode: "main" | "move" } | null>(null);
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; sx: number; sy: number } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(`folders:${gameId}`) ?? "{}"); } catch { return {}; }
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(`folders:${gameId}`, JSON.stringify(collapsed));
  }, [collapsed, gameId]);
  const [folderOrder, setFolderOrder] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(`folder-order:${gameId}`) ?? "{}"); } catch { return {}; }
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(`folder-order:${gameId}`, JSON.stringify(folderOrder));
  }, [folderOrder, gameId]);
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
    mutationFn: async (arg?: string | { speciesId: string; random?: { rank: Rank } }) => {
      const speciesId = typeof arg === "string" ? arg : (arg?.speciesId || newPkmSpecies);
      const random = typeof arg === "object" && arg ? arg.random : undefined;
      if (!speciesId) throw new Error("Pick a species");
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

      const basePayload: Record<string, unknown> = {
        game_id: gameId,
        owner_id: userId,
        species_id: speciesId,
        rank: random?.rank ?? "starter",
        is_shiny: isShiny,
        is_overgrown: finalOvergrown,
      };

      if (random) {
        const { patch, moveIds } = await rollPokemonAutofill(speciesId, random.rank, { overgrown: finalOvergrown });
        Object.assign(basePayload, patch);

        const { data, error } = await supabase
          .from("pokemon")
          .insert(basePayload as never)
          .select().single();
        if (error) throw error;
        if (moveIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("pokemon_moves") as any).insert(
            moveIds.map((mid) => ({ pokemon_id: (data as { id: string }).id, move_id: mid })),
          );
        }
        if (isShiny) toast.success("✨ Shiny rolled!");
        if (rolledOver && !newPkmOvergrown) toast.success("🌿 Overgrown rolled!");
        return data;
      }

      const { data, error } = await supabase
        .from("pokemon")
        .insert(basePayload as never)
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

  const folderPaths = Array.from(
    new Set<string>([
      ...rows.map((r) => r.folder).filter((f): f is string => !!f),
      ...extraFolders,
    ]),
  );
  const tree = buildFolderTree(folderPaths, rows, folderOrder);

  function reorderSibling(path: string, dir: -1 | 1) {
    const parts = path.split("/");
    const parentPath = parts.slice(0, -1).join("/");
    // Find sibling paths from current tree state
    const allPaths = Array.from(new Set<string>([
      ...folderPaths,
      ...folderPaths.flatMap((p) => {
        const segs = p.split("/");
        return segs.map((_, i) => segs.slice(0, i + 1).join("/"));
      }),
    ]));
    const siblings = allPaths.filter((p) => {
      const pp = p.split("/").slice(0, -1).join("/");
      return pp === parentPath;
    });
    siblings.sort((a, b) => {
      const oa = folderOrder[a] ?? Number.MAX_SAFE_INTEGER;
      const ob = folderOrder[b] ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });
    const idx = siblings.indexOf(path);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= siblings.length) return;
    [siblings[idx], siblings[target]] = [siblings[target], siblings[idx]];
    const next = { ...folderOrder };
    siblings.forEach((p, i) => { next[p] = i; });
    setFolderOrder(next);
  }
  const unfiled = rows.filter((r) => !r.folder);

  async function moveToFolder(row: CharRow, folder: string | null) {
    if (row.folder === folder) return;
    const table = row.kind === "trainer" ? "trainers" : "pokemon";
    const { error } = await supabase.from(table).update({ folder }).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["characters", gameId] });
  }

  async function moveFolderPath(oldPath: string, newParent: string | null) {
    // Compute new path; reject moving into self or descendant
    const lastSeg = oldPath.split("/").pop()!;
    const newPath = newParent ? `${newParent}/${lastSeg}` : lastSeg;
    if (newPath === oldPath) return;
    if (newParent && (newParent === oldPath || newParent.startsWith(oldPath + "/"))) {
      toast.error("Cannot move a folder into itself.");
      return;
    }
    // Detect collision
    const collides = folderPaths.some((p) => p === newPath || p.startsWith(newPath + "/"));
    if (collides) {
      toast.error(`A folder named "${lastSeg}" already exists in the destination.`);
      return;
    }
    // Update all rows whose folder === oldPath or starts with oldPath + '/'
    const prefix = oldPath + "/";
    const updates: Promise<unknown>[] = [];
    for (const r of rows) {
      if (!r.folder) continue;
      if (r.folder === oldPath || r.folder.startsWith(prefix)) {
        const remainder = r.folder === oldPath ? "" : r.folder.slice(oldPath.length);
        const newFolderPath = newPath + remainder;
        const table = r.kind === "trainer" ? "trainers" : "pokemon";
        updates.push(Promise.resolve(supabase.from(table).update({ folder: newFolderPath }).eq("id", r.id)));
      }
    }
    const results = await Promise.all(updates);
    const err = (results as { error: unknown }[]).find((r) => r?.error);
    if (err) { toast.error(String((err as { error: { message?: string } }).error?.message ?? "Failed to move folder")); return; }
    // Update extraFolders state to mirror rename
    setExtraFolders((prev) =>
      Array.from(new Set(prev.map((p) => {
        if (p === oldPath) return newPath;
        if (p.startsWith(prefix)) return newPath + p.slice(oldPath.length);
        return p;
      }))),
    );
    qc.invalidateQueries({ queryKey: ["characters", gameId] });
  }

  function addFolder(parentPath?: string | null) {
    const name = newFolder.trim();
    if (!name) return;
    if (name.includes("/")) { toast.error("Folder name cannot contain '/'"); return; }
    const full = parentPath ? `${parentPath}/${name}` : name;
    if (!extraFolders.includes(full) && !folderPaths.includes(full)) {
      setExtraFolders((p) => [...p, full]);
    }
    setNewFolder("");
  }

  async function addSubfolder(parentPath: string) {
    const name = prompt(`New subfolder name under "${parentPath}":`)?.trim();
    if (!name) return;
    if (name.includes("/")) { toast.error("Folder name cannot contain '/'"); return; }
    const full = `${parentPath}/${name}`;
    if (!extraFolders.includes(full) && !folderPaths.includes(full)) {
      setExtraFolders((p) => [...p, full]);
    }
  }

  async function deleteFolder(path: string) {
    const prefix = path + "/";
    const inFolder = rows.filter((r) => r.folder === path || (r.folder?.startsWith(prefix) ?? false));
    const msg = inFolder.length > 0
      ? `Apagar a pasta "${path}"? ${inFolder.length} ficha(s) serão movidas para "Unfiled".`
      : `Apagar a pasta "${path}"?`;
    if (!confirm(msg)) return;
    const updates: Promise<unknown>[] = [];
    for (const r of inFolder) {
      const table = r.kind === "trainer" ? "trainers" : "pokemon";
      updates.push(Promise.resolve(supabase.from(table).update({ folder: null }).eq("id", r.id)));
    }
    await Promise.all(updates);
    setExtraFolders((prev) => prev.filter((p) => p !== path && !p.startsWith(prefix)));
    qc.invalidateQueries({ queryKey: ["characters", gameId] });
    toast.success("Pasta removida");
  }

  function renderItem(r: CharRow) {
    const key = `${r.kind}:${r.id}`;
    const mapPayload: DragCharacterPayload = {
      kind: r.kind, id: r.id, label: r.label,
      imageUrl: r.image_url ?? (r.kind === "pokemon" ? r.sprite_url : null), ownerId: r.owner_id,
    };
    const startLongPress = (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" || selectMode) return;
      const sx = e.clientX, sy = e.clientY;
      const timer = setTimeout(() => {
        setCtxMenu({ row: r, x: sx, y: sy, mode: "main" });
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(30);
      }, 450);
      longPressRef.current = { timer, sx, sy };
    };
    const moveLongPress = (e: React.PointerEvent) => {
      const lp = longPressRef.current;
      if (!lp || !lp.timer) return;
      if (Math.hypot(e.clientX - lp.sx, e.clientY - lp.sy) > 8) {
        clearTimeout(lp.timer); longPressRef.current = null;
      }
    };
    const cancelLongPress = () => {
      const lp = longPressRef.current;
      if (lp?.timer) clearTimeout(lp.timer);
      longPressRef.current = null;
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
          onPointerDown={startLongPress}
          onPointerMove={moveLongPress}
          onPointerUp={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onContextMenu={(e) => {
            if (!isMobile) return;
            e.preventDefault();
            setCtxMenu({ row: r, x: e.clientX, y: e.clientY, mode: "main" });
          }}
          onClick={() => selectMode ? toggleSelected(key) : onOpen({ kind: r.kind, id: r.id, title: r.label })}
          className={`flex w-full items-center gap-2 rounded-md border ${selected.has(key) ? "border-primary bg-primary/5" : "border-border bg-card"} px-3 py-2 text-left text-sm hover:border-primary`}
          style={isMobile ? { touchAction: "manipulation" } : undefined}
        >
          {r.kind === "pokemon" && r.sprite_url
            ? <img src={r.sprite_url} alt="" className="h-6 w-6 shrink-0" />
            : <User className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{r.label}</span>
        </button>
      </div>
    );
  }

  async function sendRowToMap(r: CharRow) {
    const { data: g } = await supabase
      .from("games").select("active_page_id").eq("id", gameId).maybeSingle();
    const pageId = (g as { active_page_id?: string | null } | null)?.active_page_id ?? null;
    if (!pageId) { toast.error("Nenhuma página ativa"); return; }
    const { error } = await supabase.from("tokens").insert({
      game_id: gameId,
      page_id: pageId,
      character_kind: r.kind,
      character_id: r.id,
      label: r.label,
      image_url: r.image_url ?? (r.kind === "pokemon" ? r.sprite_url : null),
      owner_id: r.owner_id,
      x: 0.5, y: 0.5,
    });
    if (error) toast.error(error.message);
    else toast.success("Enviado para o mapa");
  }
  async function deleteRow(r: CharRow) {
    if (!confirm(`Deletar "${r.label}"?`)) return;
    const table = r.kind === "trainer" ? "trainers" : "pokemon";
    const { error } = await supabase.from(table).delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["characters", gameId] });
    toast.success("Deletado");
  }

  function FolderNodeView({ node, depth }: { node: FolderNode; depth: number }) {
    const key = node.path;
    const isHover = dropHover === key;
    const isCollapsed = !!collapsed[key];
    const totalCount = node.items.length + node.children.reduce((acc, c) => acc + countDeep(c), 0);
    return (
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(FOLDER_MIME) || e.dataTransfer.types.includes(FOLDER_PATH_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropHover(key);
          }
        }}
        onDragLeave={() => setDropHover((h) => (h === key ? null : h))}
        onDrop={(e) => {
          setDropHover(null);
          const folderPath = e.dataTransfer.getData(FOLDER_PATH_MIME);
          if (folderPath) {
            e.preventDefault();
            e.stopPropagation();
            moveFolderPath(folderPath, node.path);
            return;
          }
          const raw = e.dataTransfer.getData(FOLDER_MIME);
          if (!raw) return;
          e.preventDefault();
          e.stopPropagation();
          const { kind, id } = JSON.parse(raw) as { kind: "trainer" | "pokemon"; id: string };
          const row = rows.find((r) => r.kind === kind && r.id === id);
          if (row) moveToFolder(row, node.path);
        }}
        className={`rounded-md border ${isHover ? "border-primary bg-accent/40" : "border-border bg-background"} p-2`}
        style={{ marginLeft: depth > 0 ? 12 : 0 }}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <button
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(FOLDER_PATH_MIME, node.path);
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => toggleFolder(key)}
            className="flex flex-1 items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            title="Drag to move this folder into another folder"
          >
            <span className="inline-block w-3 text-center">{isCollapsed ? "▸" : "▾"}</span>
            <Folder className="h-3.5 w-3.5" />
            <span className="truncate">{node.name}</span>
            <span className="ml-1 text-[10px] opacity-60">({totalCount})</span>
          </button>
          <button
            type="button"
            onClick={() => reorderSibling(node.path, -1)}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Mover para cima"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => reorderSibling(node.path, 1)}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Mover para baixo"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => addSubfolder(node.path)}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Add subfolder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => deleteFolder(node.path)}
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            title="Apagar pasta"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {!isCollapsed && (
          <div className="space-y-1.5">
            {node.children.map((c) => <FolderNodeView key={c.path} node={c} depth={depth + 1} />)}
            {node.items.map(renderItem)}
            {node.items.length === 0 && node.children.length === 0 && (
              <p className="px-2 py-1 text-[11px] text-muted-foreground">Drop a sheet or folder here.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  function countDeep(n: FolderNode): number {
    return n.items.length + n.children.reduce((acc, c) => acc + countDeep(c), 0);
  }

  function UnfiledGroup() {
    const key = "__root__";
    const isHover = dropHover === key;
    const isCollapsed = !!collapsed[key];
    return (
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(FOLDER_MIME) || e.dataTransfer.types.includes(FOLDER_PATH_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropHover(key);
          }
        }}
        onDragLeave={() => setDropHover((h) => (h === key ? null : h))}
        onDrop={(e) => {
          setDropHover(null);
          const folderPath = e.dataTransfer.getData(FOLDER_PATH_MIME);
          if (folderPath) {
            e.preventDefault();
            moveFolderPath(folderPath, null);
            return;
          }
          const raw = e.dataTransfer.getData(FOLDER_MIME);
          if (!raw) return;
          e.preventDefault();
          const { kind, id } = JSON.parse(raw) as { kind: "trainer" | "pokemon"; id: string };
          const row = rows.find((r) => r.kind === kind && r.id === id);
          if (row) moveToFolder(row, null);
        }}
        className={`rounded-md border ${isHover ? "border-primary bg-accent/40" : "border-border bg-background"} p-2`}
      >
        <button
          type="button"
          onClick={() => toggleFolder(key)}
          className="mb-1.5 flex w-full items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <span className="inline-block w-3 text-center">{isCollapsed ? "▸" : "▾"}</span>
          <FolderOpen className="h-3.5 w-3.5" />
          Unfiled
          <span className="ml-1 text-[10px] opacity-60">({unfiled.length})</span>
        </button>
        {!isCollapsed && (
          <div className="space-y-1.5">
            {unfiled.map(renderItem)}
            {unfiled.length === 0 && (
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
          <MinimalSheetButton gameId={gameId} userId={userId} onCreated={(id: string, name: string) => { qc.invalidateQueries({ queryKey: ["characters", gameId] }); onOpen({ kind: "trainer", id, title: name }); }} />
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
                function matchesCatalog(s: typeof list[number]): boolean {
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
                  let pool: { id: string; name: string }[] = [];
                  if (randomMode === "catalog") {
                    pool = list.filter(matchesCatalog);
                  } else if (randomMode === "biome") {
                    const sl = speciesWithBiomes ?? [];
                    pool = sl
                      .filter((s) => (s.biomes ?? []).includes(selectedBiome))
                      .filter((s) => !fRank || s.suggested_rank === fRank);
                  } else if (randomMode === "route") {
                    const r = (routes ?? []).find((x) => x.id === selectedRouteId);
                    if (!r) { toast.error("Selecione uma rota"); return; }
                    const ids = new Set(r.species_ids);
                    pool = list.filter((s) => ids.has(s.id));
                  }
                  if (pool.length === 0) { toast.error("Nenhum Pokémon corresponde aos filtros"); return; }
                  const pick = pool[Math.floor(Math.random() * pool.length)];
                  toast.success(`🎲 ${pick.name}`);
                  createPokemon.mutate({ speciesId: pick.id, random: { rank: randomGenRank } });
                }
                return (
                  <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2.5 text-xs">
                    <div className="flex gap-1">
                      {(["catalog","route","biome"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setRandomMode(m)}
                          className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${randomMode === m ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                        >
                          {m === "catalog" ? "Catálogo" : m === "route" ? "Rota" : "Bioma"}
                        </button>
                      ))}
                    </div>

                    {randomMode === "catalog" && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="flex items-center gap-1.5"><Checkbox checked={fStarter} onCheckedChange={(v) => setFStarter(!!v)} /> Starter</label>
                        <label className="flex items-center gap-1.5"><Checkbox checked={fLegend} onCheckedChange={(v) => setFLegend(!!v)} /> Lendário</label>
                        <label className="flex items-center gap-1.5"><Checkbox checked={fFirst} onCheckedChange={(v) => setFFirst(!!v)} /> Estágio inicial</label>
                        <label className="flex items-center gap-1.5"><Checkbox checked={fSecond} onCheckedChange={(v) => setFSecond(!!v)} /> Segundo estágio</label>
                        <label className="flex items-center gap-1.5"><Checkbox checked={fLast} onCheckedChange={(v) => setFLast(!!v)} /> Último estágio</label>
                      </div>
                    )}

                    {randomMode === "biome" && (
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap">Bioma:</span>
                        <Select value={selectedBiome} onValueChange={setSelectedBiome}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {BIOME_KEYS.map((b) => <SelectItem key={b} value={b}>{BIOME_LABELS[b]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {randomMode === "route" && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="whitespace-nowrap">Rota:</span>
                          <Select value={selectedRouteId} onValueChange={setSelectedRouteId}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Escolher" /></SelectTrigger>
                            <SelectContent>
                              {(routes ?? []).length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Sem rotas ainda</div>}
                              {(routes ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name} ({r.species_ids.length})</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {isNarrator && (
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setRouteMgrOpen(true)}>Gerenciar</Button>
                          )}
                        </div>
                      </>
                    )}

                    {randomMode !== "route" && (
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
                    )}
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap">Rank do Pokémon:</span>
                      <Select value={randomGenRank} onValueChange={(v) => setRandomGenRank(v as Rank)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RANKS.map((r) => <SelectItem key={r} value={r}>{RANK_LABELS[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Atributos, skills, sexo, nature, habilidade e moves serão sorteados conforme o rank.</p>
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

          {/* Route Manager — narrator only */}
          {isNarrator && (
            <Dialog open={routeMgrOpen} onOpenChange={setRouteMgrOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Rotas de captura</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nome da nova rota (ex.: Rota 1)"
                      value={newRouteName}
                      onChange={(e) => setNewRouteName(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={async () => {
                        const name = newRouteName.trim();
                        if (!name) return;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const { error } = await (supabase.from("routes" as any) as any).insert({ game_id: gameId, name });
                        if (error) { toast.error(error.message); return; }
                        setNewRouteName("");
                        refetchRoutes();
                      }}
                    >Criar</Button>
                  </div>

                  <div className="max-h-80 space-y-2 overflow-auto">
                    {(routes ?? []).map((r) => {
                      const isEditing = editingRouteId === r.id;
                      const speciesIds = isEditing ? editingRouteSpecies : r.species_ids;
                      return (
                        <div key={r.id} className="rounded-md border border-border bg-muted/30 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">{r.name}</span>
                            <div className="flex gap-1">
                              {!isEditing ? (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setEditingRouteId(r.id); setEditingRouteSpecies(r.species_ids); setRouteSpeciesPick(""); }}>Editar</Button>
                              ) : (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={async () => {
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  const { error } = await (supabase.from("routes" as any) as any).update({ species_ids: editingRouteSpecies }).eq("id", r.id);
                                  if (error) { toast.error(error.message); return; }
                                  setEditingRouteId(null);
                                  refetchRoutes();
                                  toast.success("Rota salva");
                                }}>Salvar</Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={async () => {
                                if (!confirm(`Apagar rota "${r.name}"?`)) return;
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                await (supabase.from("routes" as any) as any).delete().eq("id", r.id);
                                refetchRoutes();
                              }}>×</Button>
                            </div>
                          </div>

                          {isEditing && (
                            <div className="mt-2 flex gap-1">
                              <Select value={routeSpeciesPick} onValueChange={setRouteSpeciesPick}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Adicionar Pokémon" /></SelectTrigger>
                                <SelectContent>
                                  {(speciesList ?? []).filter((s) => !editingRouteSpecies.includes(s.id)).map((s) => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => {
                                if (routeSpeciesPick) { setEditingRouteSpecies((p) => [...p, routeSpeciesPick]); setRouteSpeciesPick(""); }
                              }}>+</Button>
                            </div>
                          )}

                          <div className="mt-2 flex flex-wrap gap-1">
                            {speciesIds.length === 0 && <span className="text-[11px] text-muted-foreground">Vazia</span>}
                            {speciesIds.map((sid) => {
                              const s = (speciesList ?? []).find((x) => x.id === sid);
                              return (
                                <span key={sid} className="inline-flex items-center gap-1 rounded bg-background px-1.5 py-0.5 text-[11px]">
                                  {s?.name ?? "?"}
                                  {isEditing && (
                                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setEditingRouteSpecies((p) => p.filter((x) => x !== sid))}>×</button>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {(routes ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhuma rota criada ainda.</p>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

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
          placeholder="New top-level folder…"
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" onClick={() => addFolder()} disabled={!newFolder.trim()}>
          <FolderPlus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Tip: drag a character onto the map, drag sheets between folders, or drag a folder onto another to nest it. Use the + on a folder to add a subfolder.
      </p>

      <div className="space-y-2">
        {tree.map((node) => <FolderNodeView key={node.path} node={node} depth={0} />)}
        <UnfiledGroup />
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">No characters yet. Create one to get started.</p>
        )}
      </div>

      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div
            className="fixed z-50 w-56 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
            style={{
              left: Math.min(ctxMenu.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 232),
              top: Math.min(ctxMenu.y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 280),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border bg-muted/50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {ctxMenu.row.label}
            </div>
            {ctxMenu.mode === "main" ? (
              <div className="flex flex-col">
                <button className="px-3 py-2.5 text-left text-sm hover:bg-accent" onClick={async () => { await sendRowToMap(ctxMenu.row); setCtxMenu(null); }}>📍 Enviar para mapa</button>
                <button className="px-3 py-2.5 text-left text-sm hover:bg-accent" onClick={() => setCtxMenu({ ...ctxMenu, mode: "move" })}>📁 Mover para pasta</button>
                <button className="px-3 py-2.5 text-left text-sm hover:bg-accent" onClick={() => { setSelectMode(true); setSelected((p) => { const n = new Set(p); n.add(`${ctxMenu.row.kind}:${ctxMenu.row.id}`); return n; }); setCtxMenu(null); }}>☑️ Selecionar</button>
                <button className="px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10" onClick={async () => { const row = ctxMenu.row; setCtxMenu(null); await deleteRow(row); }}>🗑️ Deletar</button>
              </div>
            ) : (
              <div className="max-h-72 overflow-auto">
                <button className="block w-full px-3 py-2 text-left text-sm hover:bg-accent" onClick={async () => { const row = ctxMenu.row; setCtxMenu(null); await moveToFolder(row, null); }}>
                  📂 Unfiled
                </button>
                {folderPaths.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma pasta criada.</p>
                )}
                {folderPaths.sort().map((p) => (
                  <button key={p} className="block w-full px-3 py-2 text-left text-sm hover:bg-accent" onClick={async () => { const row = ctxMenu.row; setCtxMenu(null); await moveToFolder(row, p); }}>
                    📁 {p}
                  </button>
                ))}
                <button className="block w-full border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent" onClick={() => setCtxMenu({ ...ctxMenu, mode: "main" })}>← Voltar</button>
              </div>
            )}
          </div>
        </>
      )}
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
    await supabase.from("games").update({
      background_url: s.background_url,
      current_scenario_id: s.id,
    } as never).eq("id", gameId);
    // Auto-play first non-SFX track tagged to this scenario (if any)
    const { data: pl } = await supabase
      .from("music_tracks")
      .select("id")
      .eq("game_id", gameId)
      .eq("scenario_id", s.id)
      .eq("is_sfx", false)
      .order("position", { ascending: true })
      .limit(1);
    const first = (pl ?? [])[0] as { id: string } | undefined;
    if (first) {
      await supabase.from("music_tracks").update({ is_playing: false } as never).eq("game_id", gameId).eq("is_sfx", false);
      await supabase.from("music_tracks").update({ is_playing: true } as never).eq("id", first.id);
    }
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

const MECHANICS: { title: string; body: string; category: string }[] = [
  {
    category: "Básico",
    title: "Dice & Successes",
    body:
      "Pokérole 2.0 uses pools of d6. Each die showing 4, 5 or 6 counts as 1 success. " +
      "Build a pool by adding the relevant Attribute + Skill (or Attribute + Attribute) " +
      "and roll that many d6s. Compare successes against a difficulty (1–5) or against " +
      "an opposing roll. Ties favor the defender.",
  },
  {
    category: "Básico",
    title: "Action Economy (Round)",
    body:
      "On a round every character may take ONE main action (move + attack, or a full action " +
      "like Defend, Help, use an item). Initiative = Dexterity + Alert. Movement is " +
      "narrative — describe distance in close / nearby / far. Free actions (1‑word shouts, " +
      "drop an item) don't cost the round.",
  },
  {
    category: "Combate",
    title: "Combat — Accuracy & Damage",
    body:
      "Attack roll = (Accuracy Attribute) + (Accuracy Skill). Each success beyond the " +
      "defender's Evasion (Dex + Evasion) lands the hit. Damage roll = (Damage Stat) + " +
      "(Move Power) in d6. Subtract the target's Defense (Vitality, or Special for Special " +
      "moves) from successes; remainder = HP lost. STAB grants +1 die when the move type " +
      "matches a type of the user.",
  },
  {
    category: "Combate",
    title: "Pain Penalty",
    body:
      "Track current HP vs max. At ≤ half max HP every roll loses 1 success (pain penalty 1). " +
      "At 1 HP remaining the penalty becomes 2. Reaching 0 HP knocks the character out.",
  },
  {
    category: "Combate",
    title: "Status Conditions",
    body:
      "Burn: lose 1 HP at round start, −1 Strength. Poison: 1 HP/round, doubles after the " +
      "third round. Paralyzed: lose 1 die from Dexterity pools. Sleep / Frozen: skip turn, " +
      "wake on damage. Confused: roll d6 — on 1‑2 attack a random target. Flinched: skip " +
      "the next action. Remove with rest, items or healing moves.",
  },
  {
    category: "Mental & Vontade",
    title: "Will & Mental Effects",
    body:
      "Will = Insight + 2 (max). Spend Will to use Channel-based abilities, resist mental " +
      "moves, or push through fear/charm/confusion. Restore Will by resting, eating a meal, " +
      "or scenes of camaraderie.",
  },
  {
    category: "Mental & Vontade",
    title: "Confidence & Loyalty",
    body:
      "Pokémon track Happiness, Loyalty and Confidence (0–5). Confidence is spent like Will " +
      "to re-roll one die or shrug off a status. Build it through victories, training and " +
      "respecting the Pokémon's Nature; lose it from defeat or mistreatment.",
  },
  {
    category: "Progressão",
    title: "Ranks",
    body:
      "Starter → Beginner → Amateur → Ace → Pro → Master. Rank caps attributes & skills " +
      "and unlocks new moves. Players advance by completing significant story beats — not by " +
      "XP grinding. The Narrator decides when the party gains a Rank.",
  },
  {
    category: "Progressão",
    title: "Move Learning Cap",
    body:
      "A Pokémon knows at most (Insight + 2) moves at a time. To learn a new move beyond " +
      "the cap you must forget one. Trainers also cap their battle techniques the same way.",
  },
  {
    category: "Progressão",
    title: "Evolution",
    body:
      "Evolve when at the required Rank (or holding the right item/stone) and after a " +
      "meaningful narrative moment. Evolving raises Base HP and one Attribute cap. A Pokémon " +
      "may refuse evolution — Loyalty rolls decide.",
  },
  {
    category: "Especial",
    title: "Z-Moves & Dynamax",
    body:
      "Z-Move: once per scene, transform one damaging move into its Z-form (renamed by type, " +
      "Power +5/+4/+3/+2 by bracket). Dynamax: HP ×2 for 3 rounds; physical/special moves " +
      "become Max-moves. Gigantamax: as Dynamax but the species gets a unique G-Max move " +
      "(Power +3 of the base) — only species with a G-Max form.",
  },
  {
    category: "Social",
    title: "Social / Contest Stats",
    body:
      "Tough · Cool · Beautiful · Cute · Clever. Used for Contests, performances, and " +
      "social conflict (combined with skills like Allure, Perform, Etiquette, Intimidate). " +
      "Same d6-success mechanics as combat.",
  },
  {
    category: "Skills",
    title: "Skills",
    body:
      "Trainer skills include Brawl, Throw, Weapons (attack rolls use Dex + one of these). " +
      "Pokémon attack with Brawl or Channel + Dexterity. Shared skills: Clash, Evasion, " +
      "Alert, Athletic, Nature, Stealth, Allure, Etiquette, Intimidate, Perform, Crafts, " +
      "Lore, Medicine, Science, Empathy. Cap = current Rank tier.",
  },
  {
    category: "Itens",
    title: "Healing & Items",
    body:
      "Potion +2 HP, Super +4, Hyper +6, Max heals to full. Battle Items (X Attack, X Def…) " +
      "give +1 to that stat's rolls until end of scene. Items are limited per fight — track " +
      "your bag and battle pouch on the sheet.",
  },
];

const MECHANICS_CATEGORY_ORDER = ["Básico", "Combate", "Mental & Vontade", "Progressão", "Especial", "Social", "Skills", "Itens"];

function MechanicsCompendium() {
  const [q, setQ] = useState("");
  const filtered = MECHANICS.filter(
    (m) => !q || m.title.toLowerCase().includes(q.toLowerCase()) || m.body.toLowerCase().includes(q.toLowerCase()),
  );
  const groups = MECHANICS_CATEGORY_ORDER
    .map((cat) => ({ cat, items: filtered.filter((m) => m.category === cat) }))
    .filter((g) => g.items.length > 0);
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <Input placeholder="Search rules…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-sm" />
      <div className="flex-1 overflow-y-auto space-y-3">
        {groups.map((g) => (
          <section key={g.cat} className="space-y-1.5">
            <h3 className="sticky top-0 z-[1] bg-background/95 px-1 py-1 text-[11px] font-bold uppercase tracking-wider text-primary backdrop-blur">
              {g.cat}
            </h3>
            {g.items.map((m) => (
              <details key={m.title} className="rounded-md border border-border bg-card">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">{m.title}</summary>
                <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{m.body}</p>
              </details>
            ))}
          </section>
        ))}
        {groups.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No matches.</p>}
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
      initialX={16}
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
  setBackgroundUrl,
}: {
  gameId: string;
  currentBg: string | null;
  setBackgroundUrl: (url: string) => void | Promise<void>;
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
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-background px-1">
            <button
              type="button"
              title="Zoom out background"
              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent"
              onClick={() => window.dispatchEvent(new CustomEvent("map-zoom", { detail: { delta: -0.1 } }))}
            ><ZoomOut className="h-3.5 w-3.5" /></button>
            <button
              type="button"
              title="Zoom in background"
              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent"
              onClick={() => window.dispatchEvent(new CustomEvent("map-zoom", { detail: { delta: 0.1 } }))}
            ><ZoomIn className="h-3.5 w-3.5" /></button>
            <button
              type="button"
              title="Reset background size"
              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent"
              onClick={() => window.dispatchEvent(new CustomEvent("map-zoom", { detail: { reset: true } }))}
            ><RotateCcw className="h-3.5 w-3.5" /></button>
          </div>
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
      return await fetchAllPaged<SpeciesRow>("species", "*", { orderBy: "dex_number", ascending: true });
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
            <div className="divide-y divide-border border-t border-border text-xs">
              <div className="px-3 py-2">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">Geral</div>
                <p><span className="font-semibold">Base HP:</span> {s.base_hp}</p>
                <p><span className="font-semibold">Rank sugerido:</span> {s.suggested_rank ?? "—"}</p>
              </div>
              {Object.keys(s.base_attrs ?? {}).length > 0 && (
                <div className="px-3 py-2">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">Atributos base</div>
                  <p className="text-muted-foreground">{Object.entries(s.base_attrs).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
                </div>
              )}
              <div className="px-3 py-2">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">Habilidades</div>
                <p>{(s.abilities ?? []).join(", ") || "—"}</p>
                {s.hidden_ability && <p className="text-muted-foreground"><em>Hidden:</em> {s.hidden_ability}</p>}
              </div>
              {(s.evolutions ?? []).length > 0 && (
                <div className="px-3 py-2">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">Evoluções</div>
                  <p>{s.evolutions.join(" → ")}</p>
                </div>
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
      return await fetchAllPaged<MoveRow>("moves", "*", { orderBy: "name", ascending: true });
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
                  <div className="divide-y divide-border border-t border-border text-xs">
                    <div className="px-3 py-2">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">Acurácia</div>
                      <p>{m.accuracy_stat ?? "—"}{m.accuracy_skill ? ` + ${m.accuracy_skill}` : ""}</p>
                    </div>
                    <div className="px-3 py-2">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">Dano & Alvo</div>
                      <p><span className="font-semibold">Stat:</span> {m.damage_stat ?? "—"} · <span className="font-semibold">Alvo:</span> {m.target}</p>
                    </div>
                    {m.effect && (
                      <div className="px-3 py-2">
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">Efeito</div>
                        <p className="text-muted-foreground">{m.effect}</p>
                      </div>
                    )}
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
  const groups = filtered.reduce<Record<string, AbilityRow[]>>((acc, a) => {
    const k = (a.name?.[0] ?? "#").toUpperCase();
    (acc[k] ??= []).push(a);
    return acc;
  }, {});
  const letters = Object.keys(groups).sort();
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <Input placeholder="Search ability…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-sm" />
      <div className="flex-1 overflow-y-auto space-y-3">
        {letters.map((L) => (
          <section key={L} className="space-y-1">
            <h3 className="sticky top-0 z-[1] bg-background/95 px-1 py-1 text-[11px] font-bold uppercase tracking-wider text-primary backdrop-blur">
              {L}
            </h3>
            {groups[L].map((a) => (
              <details key={a.id} className="rounded-md border border-border bg-card">
                <summary className="cursor-pointer px-3 py-1.5 text-sm font-semibold">{a.name}</summary>
                <div className="border-t border-border px-3 py-2 text-xs">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">Efeito</div>
                  <p className="text-muted-foreground">{a.effect || "—"}</p>
                </div>
              </details>
            ))}
          </section>
        ))}
        {filtered.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No abilities.</p>}
      </div>
    </div>
  );
}

function GameSettingsButton({ gameId }: { gameId: string }) {
  const qc = useQueryClient();
  const savedSpdefIns = useGameSpdefUsesInsight(gameId);
  const [open, setOpen] = useState(false);
  const [shiny, setShiny] = useState<number>(10);
  const [over, setOver] = useState<number>(0);
  const [spdefIns, setSpdefIns] = useState<boolean>(false);
  const [effFlat, setEffFlat] = useState<boolean>(true);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [gridSnap, setGridSnap] = useState(true);
  const [gridSnapMode, setGridSnapMode] = useState<"center" | "line" | "free">("center");
  const [gridSize, setGridSize] = useState(56);
  const [gridColor, setGridColor] = useState("#000000");
  const [gridOpacity, setGridOpacity] = useState(30);
  const [gridUnitM, setGridUnitM] = useState(1.5);
  const [gridUnitLabel, setGridUnitLabel] = useState("m");
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const c of REACTION_DECK) m[c.id] = c.defaultWeight;
    return m;
  });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase
        .from("games")
        .select("shiny_chance,overgrown_chance,contest_weights,spdef_uses_insight,effectiveness_flat,grid_enabled,grid_snap,grid_snap_mode,grid_size,grid_color,grid_opacity,grid_unit_m,grid_unit_label")
        .eq("id", gameId)
        .single();
      if (error) {
        toast.error(error.message);
        setSpdefIns(savedSpdefIns);
        return;
      }
      const row = data as {
        shiny_chance?: number; overgrown_chance?: number;
        contest_weights?: Record<string, number> | null; spdef_uses_insight?: boolean;
        effectiveness_flat?: boolean;
        grid_enabled?: boolean; grid_snap?: boolean; grid_snap_mode?: string; grid_size?: number;
        grid_color?: string; grid_opacity?: number; grid_unit_m?: number; grid_unit_label?: string;
      } | null;
      setShiny(row?.shiny_chance ?? 10);
      setOver(row?.overgrown_chance ?? 0);
      setSpdefIns(Boolean(row?.spdef_uses_insight));
      setEffFlat(row?.effectiveness_flat === undefined || row?.effectiveness_flat === null ? true : Boolean(row.effectiveness_flat));
      setGridEnabled(row?.grid_enabled ?? true);
      setGridSnap(row?.grid_snap ?? true);
      setGridSnapMode(((row?.grid_snap_mode as "center" | "line" | "free" | undefined) ?? "center"));
      setGridSize(row?.grid_size ?? 56);
      setGridColor(row?.grid_color ?? "#000000");
      setGridOpacity(row?.grid_opacity ?? 30);
      setGridUnitM(Number(row?.grid_unit_m ?? 1.5));
      setGridUnitLabel(row?.grid_unit_label ?? "m");
      const w: Record<string, number> = {};
      for (const c of REACTION_DECK) w[c.id] = row?.contest_weights?.[c.id] ?? c.defaultWeight;
      setWeights(w);
    })();
  }, [open, gameId, savedSpdefIns]);

  const weightTotal = REACTION_DECK.reduce((s, c) => s + (weights[c.id] ?? 0), 0);

  async function save() {
    const s = Math.max(0, Math.min(100, Math.round(shiny)));
    const o = Math.max(0, Math.min(100, Math.round(over)));
    const cw: Record<string, number> = {};
    for (const c of REACTION_DECK) cw[c.id] = Math.max(0, Math.min(100, Math.round(weights[c.id] ?? 0)));
    const gs = Math.max(16, Math.min(256, Math.round(gridSize)));
    const go = Math.max(0, Math.min(100, Math.round(gridOpacity)));
    const um = Math.max(0.1, Math.min(100, Number(gridUnitM)));
    const { error } = await supabase
      .from("games")
      .update({
        shiny_chance: s, overgrown_chance: o, contest_weights: cw, spdef_uses_insight: spdefIns,
        effectiveness_flat: effFlat,
        grid_enabled: gridEnabled, grid_snap: gridSnap, grid_snap_mode: gridSnapMode, grid_size: gs,
        grid_color: gridColor, grid_opacity: go, grid_unit_m: um, grid_unit_label: gridUnitLabel,
      } as never)
      .eq("id", gameId);
    if (error) { toast.error(error.message); return; }
    toast.success("Configurações salvas");
    qc.setQueryData(["game-spdef-uses-insight", gameId], spdefIns);
    qc.setQueryData(["game-effectiveness-flat", gameId], effFlat);
    qc.invalidateQueries({ queryKey: ["game", gameId] });
    qc.invalidateQueries({ queryKey: ["game-spdef-uses-insight", gameId] });
    qc.invalidateQueries({ queryKey: ["game-effectiveness-flat", gameId] });
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
          <div
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card p-3"
            onClick={() => setSpdefIns((v) => !v)}
          >
            <Checkbox
              checked={spdefIns}
              onCheckedChange={(v) => setSpdefIns(!!v)}
              onClick={(e) => e.stopPropagation()}
            />
            <div>
              <span className="text-sm font-semibold">SpDef usa Insight (regra da casa)</span>
              <p className="text-[11px] text-muted-foreground">Quando ligado, a Defesa Especial usa Insight no lugar de Vitality em toda a mesa.</p>
            </div>
          </div>
          <div
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card p-3"
            onClick={() => setEffFlat((v) => !v)}
          >
            <Checkbox
              checked={effFlat}
              onCheckedChange={(v) => setEffFlat(!!v)}
              onClick={(e) => e.stopPropagation()}
            />
            <div>
              <span className="text-sm font-semibold">Efetividade: regra da casa (+/− sucessos)</span>
              <p className="text-[11px] text-muted-foreground">Ligado: super-efetivo soma +1/+2 sucessos de dano (e não-efetivo subtrai 1/2). Desligado: usa o RAW e adiciona/remove dados da pool antes de rolar.</p>
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-3 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-primary">Grid do mapa</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={gridEnabled} onCheckedChange={(v) => setGridEnabled(!!v)} /> Mostrar grid
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={gridSnap} onCheckedChange={(v) => setGridSnap(!!v)} /> Snap-to-grid
              </label>
              <div>
                <Label className="text-xs">Modo de snap</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  value={gridSnapMode}
                  disabled={!gridSnap}
                  onChange={(e) => setGridSnapMode(e.target.value as "center" | "line" | "free")}
                >
                  <option value="center">Centro do quadrado</option>
                  <option value="line">Linhas da grelha</option>
                  <option value="free">Livre</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Tamanho da célula (px)</Label>
                <Input type="number" min={16} max={256} value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Cor</Label>
                <input type="color" value={gridColor} onChange={(e) => setGridColor(e.target.value)} className="h-9 w-full cursor-pointer rounded border border-input bg-transparent" />
              </div>
              <div>
                <Label className="text-xs">Opacidade (%)</Label>
                <Input type="number" min={0} max={100} value={gridOpacity} onChange={(e) => setGridOpacity(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Unidade por célula</Label>
                <div className="flex gap-1">
                  <Input type="number" step="0.1" min={0.1} value={gridUnitM} onChange={(e) => setGridUnitM(Number(e.target.value))} className="flex-1" />
                  <Input value={gridUnitLabel} onChange={(e) => setGridUnitLabel(e.target.value)} className="w-16" placeholder="m" />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Usado pela régua para mostrar distância (ex.: 1.5 m por célula).</p>
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

function MinimalSheetButton({
  gameId, userId, onCreated,
}: {
  gameId: string;
  userId: string;
  onCreated: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    if (!name.trim()) { toast.error("Dê um nome para a ficha"); return; }
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("trainers") as any)
      .insert({ game_id: gameId, owner_id: userId, name: name.trim(), is_minimal: true, image_url: image, description: desc || null })
      .select().single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setOpen(false); setName(""); setImage(null); setDesc("");
    onCreated((data as { id: string; name: string }).id, (data as { id: string; name: string }).name);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 h-3.5 w-3.5" /> Handouts
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo Handout</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: NPC Mestre Bug" />
          </div>
          <div className="flex items-start gap-3">
            {image ? (
              <img src={image} alt="" className="h-20 w-20 rounded-md border border-border object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">Imagem</div>
            )}
            <div className="flex flex-col gap-1.5">
              <ImageSourceDialog title="Imagem" onPick={(u: string) => setImage(u)} />
              {image && <Button size="sm" variant="outline" onClick={() => setImage(null)}>Remover</Button>}
            </div>
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
              placeholder="Texto livre…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={create} disabled={busy}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
