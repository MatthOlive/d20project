import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Invisible, always-mounted YouTube player. Subscribes to the music_tracks
 * table for a given game and plays whichever track is marked is_playing.
 * Mount this once at the game layout level so audio keeps playing while the
 * user navigates away from the Music tab.
 */
export function MusicPlayer({ gameId }: { gameId: string }) {
  const [videoId, setVideoId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("music_tracks" as never)
        .select("video_id,is_playing")
        .eq("game_id", gameId)
        .eq("is_playing", true)
        .maybeSingle();
      if (cancelled) return;
      setVideoId((data as { video_id: string } | null)?.video_id ?? null);
    }
    void load();
    const ch = supabase
      .channel(`music-player-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "music_tracks", filter: `game_id=eq.${gameId}` },
        () => void load(),
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [gameId]);

  if (!videoId) return null;
  return (
    <iframe
      key={videoId}
      title="Music"
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1&modestbranding=1`}
      allow="autoplay; encrypted-media"
      style={{ position: "fixed", left: -9999, top: -9999, width: 1, height: 1, border: 0 }}
      aria-hidden
    />
  );
}
