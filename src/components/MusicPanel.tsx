import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { lookupYouTubeVideo } from "@/lib/youtube.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Play, Pause, Trash2, Music as MusicIcon, SkipForward, Volume2, Zap } from "lucide-react";

type Track = {
  id: string;
  game_id: string;
  video_id: string;
  title: string;
  thumbnail: string | null;
  position: number;
  added_by: string;
  is_playing: boolean;
  created_at: string;
  scenario_id: string | null;
  volume: number;
  is_sfx: boolean;
  hotkey: string | null;
};

type Scenario = { id: string; name: string };

export function MusicPanel({
  gameId,
  isNarrator,
}: {
  gameId: string;
  isNarrator: boolean;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [newAsSfx, setNewAsSfx] = useState(false);
  const [newScenario, setNewScenario] = useState<string>("__none__");
  const lookup = useServerFn(lookupYouTubeVideo);

  const { data: tracks = [] } = useQuery<Track[]>({
    queryKey: ["music-tracks", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("music_tracks")
        .select("*")
        .eq("game_id", gameId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Track[];
    },
  });

  const { data: scenarios = [] } = useQuery<Scenario[]>({
    queryKey: ["scenarios", gameId],
    queryFn: async () => {
      const { data } = await supabase.from("scenarios").select("id,name").eq("game_id", gameId);
      return (data ?? []) as Scenario[];
    },
  });

  const { data: game } = useQuery({
    queryKey: ["music-game", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("games")
        .select("master_volume,current_scenario_id")
        .eq("id", gameId)
        .single();
      return data as { master_volume: number; current_scenario_id: string | null } | null;
    },
  });
  const masterVolume = game?.master_volume ?? 80;

  // Realtime sync
  useEffect(() => {
    const ch = supabase
      .channel(`music-${gameId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "music_tracks", filter: `game_id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ["music-tracks", gameId] }))
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ["music-game", gameId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [gameId, qc]);

  const addTrack = useMutation({
    mutationFn: async () => {
      if (!input.trim()) throw new Error("Cole um link ou nome");
      const info = await lookup({ data: { query: input } });
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Não autenticado");
      const maxPos = tracks.reduce((m, t) => Math.max(m, t.position), 0);
      const payload = {
        game_id: gameId,
        video_id: info.videoId,
        title: info.title,
        thumbnail: info.thumbnail,
        position: maxPos + 1,
        added_by: uid,
        is_sfx: newAsSfx,
        scenario_id: newScenario === "__none__" ? null : newScenario,
        volume: 80,
      };
      const { error } = await supabase.from("music_tracks").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => { setInput(""); toast.success("Adicionado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const musicTracks = tracks.filter((t) => !t.is_sfx);
  const sfxTracks = tracks.filter((t) => t.is_sfx);
  const playing = musicTracks.find((t) => t.is_playing) ?? null;

  async function playTrack(id: string) {
    if (!isNarrator) return;
    await supabase.from("music_tracks").update({ is_playing: false } as never).eq("game_id", gameId).eq("is_sfx", false);
    await supabase.from("music_tracks").update({ is_playing: true } as never).eq("id", id);
  }
  async function stopAll() {
    if (!isNarrator) return;
    await supabase.from("music_tracks").update({ is_playing: false } as never).eq("game_id", gameId);
  }
  async function nextTrack() {
    if (!isNarrator || !playing) return;
    const idx = musicTracks.findIndex((t) => t.id === playing.id);
    const next = musicTracks[idx + 1];
    if (next) await playTrack(next.id);
    else await stopAll();
  }
  async function deleteTrack(id: string) {
    const { error } = await supabase.from("music_tracks").delete().eq("id", id);
    if (error) toast.error("Você não tem permissão para remover esta faixa.");
  }
  async function setVolume(id: string, vol: number) {
    await supabase.from("music_tracks").update({ volume: vol } as never).eq("id", id);
  }
  async function setHotkey(id: string, hk: string) {
    const v = hk.trim().slice(0, 1).toLowerCase() || null;
    await supabase.from("music_tracks").update({ hotkey: v } as never).eq("id", id);
  }
  async function setScenario(id: string, scenarioId: string) {
    const v = scenarioId === "__none__" ? null : scenarioId;
    await supabase.from("music_tracks").update({ scenario_id: v } as never).eq("id", id);
  }
  async function setMaster(v: number) {
    if (!isNarrator) return;
    await supabase.from("games").update({ master_volume: v } as never).eq("id", gameId);
    qc.setQueryData(["music-game", gameId], (old: typeof game) => old ? { ...old, master_volume: v } : old);
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <MusicIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Música & Soundboard</span>
      </div>

      {/* Master volume */}
      <div className="rounded-md border border-border bg-muted/30 p-2">
        <div className="mb-1 flex items-center gap-2 text-xs">
          <Volume2 className="h-3.5 w-3.5" />
          <span className="font-semibold">Volume master</span>
          <span className="ml-auto tabular-nums text-muted-foreground">{masterVolume}%</span>
        </div>
        <Slider
          disabled={!isNarrator}
          value={[masterVolume]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => setMaster(v[0] ?? 0)}
        />
      </div>

      {playing && (
        <div className="rounded-md border border-primary bg-primary/10 p-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-xs font-medium">▶ {playing.title}</div>
            {isNarrator && (
              <>
                <Button size="sm" variant="ghost" onClick={nextTrack} title="Próxima">
                  <SkipForward className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={stopAll} title="Parar">
                  <Pause className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add */}
      <div className="space-y-1.5 rounded-md border border-border p-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTrack.mutate()}
          placeholder="Link do YouTube ou nome…"
          className="h-8 text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[11px]">
            <Checkbox checked={newAsSfx} onCheckedChange={(c) => setNewAsSfx(c === true)} />
            Soundboard (SFX)
          </label>
          {!newAsSfx && (
            <Select value={newScenario} onValueChange={setNewScenario}>
              <SelectTrigger className="h-7 flex-1 text-[11px]"><SelectValue placeholder="Cena (qualquer)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Qualquer cena</SelectItem>
                {scenarios.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={() => addTrack.mutate()} disabled={addTrack.isPending}>+</Button>
        </div>
      </div>

      {/* Music list */}
      <div className="flex-1 space-y-3 overflow-auto">
        <section>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Faixas ({musicTracks.length})
          </div>
          {musicTracks.length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">Sem faixas. Adicione acima.</p>
          )}
          <div className="space-y-1">
            {musicTracks.map((t) => (
              <TrackRow
                key={t.id}
                t={t}
                scenarios={scenarios}
                canEdit={isNarrator || t.added_by === user?.id}
                canControl={isNarrator}
                onPlay={() => playTrack(t.id)}
                onDelete={() => deleteTrack(t.id)}
                onVolume={(v) => setVolume(t.id, v)}
                onScenario={(s) => setScenario(t.id, s)}
                onHotkey={() => { /* not used for music */ }}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Zap className="h-3 w-3" /> Soundboard ({sfxTracks.length})
          </div>
          {sfxTracks.length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">Sem SFX. Marque "Soundboard" ao adicionar.</p>
          )}
          <div className="space-y-1">
            {sfxTracks.map((t) => (
              <TrackRow
                key={t.id}
                t={t}
                sfx
                scenarios={scenarios}
                canEdit={isNarrator || t.added_by === user?.id}
                canControl={false}
                onPlay={() => { /* SFX triggered by hotkey */ }}
                onDelete={() => deleteTrack(t.id)}
                onVolume={(v) => setVolume(t.id, v)}
                onScenario={() => { /* SFX is global */ }}
                onHotkey={(k) => setHotkey(t.id, k)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function TrackRow({
  t, sfx, scenarios, canEdit, canControl,
  onPlay, onDelete, onVolume, onScenario, onHotkey,
}: {
  t: Track;
  sfx?: boolean;
  scenarios: Scenario[];
  canEdit: boolean;
  canControl: boolean;
  onPlay: () => void;
  onDelete: () => void;
  onVolume: (v: number) => void;
  onScenario: (s: string) => void;
  onHotkey: (k: string) => void;
}) {
  const [localVol, setLocalVol] = useState(t.volume);
  useEffect(() => { setLocalVol(t.volume); }, [t.volume]);
  return (
    <div className={`flex flex-col gap-1 rounded-md border p-1.5 ${t.is_playing ? "border-primary bg-primary/10" : "border-border"}`}>
      <div className="flex items-center gap-2">
        {t.thumbnail && (
          <img src={t.thumbnail} alt="" className="h-9 w-12 shrink-0 rounded object-cover" />
        )}
        <div className="min-w-0 flex-1 truncate text-xs font-medium" title={t.title}>{t.title}</div>
        {!sfx && canControl && !t.is_playing && (
          <Button size="sm" variant="ghost" onClick={onPlay} title="Tocar"><Play className="h-3.5 w-3.5" /></Button>
        )}
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={onDelete} title="Remover"><Trash2 className="h-3.5 w-3.5" /></Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Volume2 className="h-3 w-3 text-muted-foreground" />
        <Slider
          disabled={!canEdit}
          value={[localVol]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => setLocalVol(v[0] ?? 0)}
          onValueCommit={(v) => onVolume(v[0] ?? 0)}
          className="flex-1"
        />
        <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">{localVol}%</span>
      </div>
      {sfx ? (
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground">Tecla</span>
          <Input
            disabled={!canEdit}
            value={t.hotkey ?? ""}
            onChange={(e) => onHotkey(e.target.value)}
            maxLength={1}
            placeholder="ex.: q"
            className="h-6 w-12 text-center text-xs"
          />
        </div>
      ) : (
        <Select disabled={!canEdit} value={t.scenario_id ?? "__none__"} onValueChange={onScenario}>
          <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Qualquer cena</SelectItem>
            {scenarios.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
