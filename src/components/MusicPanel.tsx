import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lookupYouTubeVideo } from "@/lib/youtube.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Play, Pause, Trash2, Music as MusicIcon, SkipForward } from "lucide-react";

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
};

export function MusicPanel({
  gameId,
  isNarrator,
}: {
  gameId: string;
  isNarrator: boolean;
}) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const lookup = useServerFn(lookupYouTubeVideo);

  const { data: tracks = [] } = useQuery<Track[]>({
    queryKey: ["music-tracks", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("music_tracks" as never)
        .select("*")
        .eq("game_id", gameId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Track[];
    },
  });

  // Realtime sync
  useEffect(() => {
    const ch = supabase
      .channel(`music-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "music_tracks", filter: `game_id=eq.${gameId}` },
        () => qc.invalidateQueries({ queryKey: ["music-tracks", gameId] }),
      )
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
      const { error } = await supabase.from("music_tracks" as never).insert({
        game_id: gameId,
        video_id: info.videoId,
        title: info.title,
        thumbnail: info.thumbnail,
        position: maxPos + 1,
        added_by: uid,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { setInput(""); toast.success("Música adicionada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const playing = tracks.find((t) => t.is_playing) ?? null;

  async function playTrack(id: string) {
    if (!isNarrator) return;
    // Set all to not playing, then mark this one
    await supabase.from("music_tracks" as never).update({ is_playing: false } as never).eq("game_id", gameId);
    await supabase.from("music_tracks" as never).update({ is_playing: true } as never).eq("id", id);
  }
  async function stopAll() {
    if (!isNarrator) return;
    await supabase.from("music_tracks" as never).update({ is_playing: false } as never).eq("game_id", gameId);
  }
  async function nextTrack() {
    if (!isNarrator || !playing) return;
    const idx = tracks.findIndex((t) => t.id === playing.id);
    const next = tracks[idx + 1];
    if (next) await playTrack(next.id);
    else await stopAll();
  }
  async function deleteTrack(id: string) {
    await supabase.from("music_tracks" as never).delete().eq("id", id);
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <MusicIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Música</span>
      </div>

      {playing && (
        <div className="rounded-md border border-border bg-muted/30 p-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate text-xs font-medium">▶ {playing.title}</div>
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

      <div className="flex gap-1.5">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTrack.mutate()}
          placeholder="Link do YouTube ou nome da música…"
          className="h-8 text-xs"
        />
        <Button size="sm" onClick={() => addTrack.mutate()} disabled={addTrack.isPending}>
          +
        </Button>
      </div>

      <div className="flex-1 space-y-1 overflow-auto">
        {tracks.length === 0 && (
          <p className="px-1 text-xs text-muted-foreground">Sem músicas. Adicione uma acima.</p>
        )}
        {tracks.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 rounded-md border p-1.5 ${t.is_playing ? "border-primary bg-primary/10" : "border-border"}`}
          >
            {t.thumbnail && (
              <img src={t.thumbnail} alt="" className="h-9 w-12 rounded object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{t.title}</div>
            </div>
            {isNarrator && !t.is_playing && (
              <Button size="sm" variant="ghost" onClick={() => playTrack(t.id)} title="Tocar">
                <Play className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => deleteTrack(t.id)} title="Remover">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
