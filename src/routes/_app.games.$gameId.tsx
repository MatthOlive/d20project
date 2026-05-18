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
import { Copy, Plus, Crown, Sparkles, User, FolderPlus, Folder, FolderOpen } from "lucide-react";
import { rollD6 } from "@/lib/pokerole";

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

  async function rollFromSheet(label: string, n: number) {
    if (!user) return;
    const result = rollD6(n);
    await supabase.from("chat_messages").insert({
      game_id: gameId, user_id: user.id, kind: "roll",
      body: label, roll_data: { ...result, label },
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

  const createTrainer = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("trainers")
        .insert({ game_id: gameId, owner_id: user!.id, name: "New Trainer" })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["characters", gameId] });
      openWindow({ kind: "trainer", id: t.id, title: t.name });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [newPkmSpecies, setNewPkmSpecies] = useState<string>("");
  const [pkmDialogOpen, setPkmDialogOpen] = useState(false);
  const createPokemon = useMutation({
    mutationFn: async () => {
      if (!newPkmSpecies) throw new Error("Pick a species");
      const { data, error } = await supabase
        .from("pokemon")
        .insert({ game_id: gameId, owner_id: user!.id, species_id: newPkmSpecies, rank: "starter" })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["characters", gameId] });
      setPkmDialogOpen(false);
      setNewPkmSpecies("");
      openWindow({ kind: "pokemon", id: p.id, title: "Pokémon" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
          <TabsContent value="compendium" className="flex-1 overflow-auto p-4">
            <p className="text-sm text-muted-foreground">
              The Pokérole 2.0 compendium will live here. Upload the rules PDF and entries will populate.
            </p>
          </TabsContent>
          <TabsContent value="files" className="flex-1 overflow-auto p-3">
            <FilesPanel
              gameId={gameId}
              characters={characters}
              onOpen={(w) => openWindow(w)}
              qc={qc}
            />
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
