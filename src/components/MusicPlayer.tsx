import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Invisible, always-mounted YouTube music engine for a game.
 *
 * - Subscribes to music_tracks for `is_playing = true` (non-SFX track).
 * - Uses the YouTube IFrame API on two stacked players so we can crossfade
 *   between tracks (~1.2 s) instead of cutting abruptly.
 * - Listens to `games.master_volume` to scale every track's per-track volume.
 * - Listens for soundboard hotkeys: tracks flagged `is_sfx` with a `hotkey`
 *   play once when the user presses that key (single-letter, ignored while
 *   typing in inputs).
 */

type TrackRow = {
  id: string;
  video_id: string;
  is_playing: boolean;
  volume: number;
  is_sfx: boolean;
  hotkey: string | null;
};

type YTPlayer = {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  setVolume: (v: number) => void;
  destroy: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId?: string;
          playerVars?: Record<string, number | string>;
          events?: { onReady?: () => void; onStateChange?: (e: { data: number }) => void };
        },
      ) => YTPlayer;
      PlayerState: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve();
  });
  return ytApiPromise;
}

const FADE_MS = 1200;
const FADE_STEPS = 24;

function fadeVolume(player: YTPlayer | null, from: number, to: number) {
  if (!player) return;
  const step = (to - from) / FADE_STEPS;
  let i = 0;
  const interval = window.setInterval(() => {
    i += 1;
    const v = Math.max(0, Math.min(100, Math.round(from + step * i)));
    try { player.setVolume(v); } catch { /* iframe still warming up */ }
    if (i >= FADE_STEPS) window.clearInterval(interval);
  }, FADE_MS / FADE_STEPS);
}

export function MusicPlayer({ gameId }: { gameId: string }) {
  const [ready, setReady] = useState(false);
  const containerA = useRef<HTMLDivElement>(null);
  const containerB = useRef<HTMLDivElement>(null);
  const sfxContainer = useRef<HTMLDivElement>(null);
  const playerA = useRef<YTPlayer | null>(null);
  const playerB = useRef<YTPlayer | null>(null);
  const sfxPlayer = useRef<YTPlayer | null>(null);
  const activeSlot = useRef<"A" | "B">("A");
  const currentTrack = useRef<TrackRow | null>(null);
  const masterVolume = useRef<number>(80);

  // Boot YT API + create two stacked players for crossfade.
  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !window.YT?.Player) return;
      if (containerA.current && !playerA.current) {
        playerA.current = new window.YT.Player(containerA.current, {
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1 },
          events: { onReady: () => setReady(true) },
        });
      }
      if (containerB.current && !playerB.current) {
        playerB.current = new window.YT.Player(containerB.current, {
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1 },
        });
      }
      if (sfxContainer.current && !sfxPlayer.current) {
        sfxPlayer.current = new window.YT.Player(sfxContainer.current, {
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1 },
        });
      }
    });
    return () => {
      cancelled = true;
      try { playerA.current?.destroy(); } catch { /* noop */ }
      try { playerB.current?.destroy(); } catch { /* noop */ }
      try { sfxPlayer.current?.destroy(); } catch { /* noop */ }
      playerA.current = null;
      playerB.current = null;
      sfxPlayer.current = null;
    };
  }, []);

  // Crossfade swap.
  function playTrackWithFade(track: TrackRow) {
    if (currentTrack.current?.id === track.id) {
      // Volume change for same track
      const target = Math.round(track.volume * (masterVolume.current / 100));
      const active = activeSlot.current === "A" ? playerA.current : playerB.current;
      try { active?.setVolume(target); } catch { /* noop */ }
      currentTrack.current = track;
      return;
    }
    const outgoing = activeSlot.current === "A" ? playerA.current : playerB.current;
    const incoming = activeSlot.current === "A" ? playerB.current : playerA.current;
    if (!incoming) return;
    const target = Math.round(track.volume * (masterVolume.current / 100));
    try {
      incoming.setVolume(0);
      incoming.loadVideoById(track.video_id);
      incoming.playVideo();
    } catch { /* noop */ }
    fadeVolume(incoming, 0, target);
    if (outgoing && currentTrack.current) {
      const fromVol = Math.round((currentTrack.current.volume) * (masterVolume.current / 100));
      fadeVolume(outgoing, fromVol, 0);
      window.setTimeout(() => { try { outgoing.stopVideo(); } catch { /* noop */ } }, FADE_MS + 50);
    }
    activeSlot.current = activeSlot.current === "A" ? "B" : "A";
    currentTrack.current = track;
  }

  function stopCurrent() {
    const outgoing = activeSlot.current === "A" ? playerA.current : playerB.current;
    if (outgoing && currentTrack.current) {
      const fromVol = Math.round((currentTrack.current.volume) * (masterVolume.current / 100));
      fadeVolume(outgoing, fromVol, 0);
      window.setTimeout(() => { try { outgoing.stopVideo(); } catch { /* noop */ } }, FADE_MS + 50);
    }
    currentTrack.current = null;
  }

  // Subscribe to track + game changes.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function loadMaster() {
      const { data } = await supabase
        .from("games")
        .select("master_volume")
        .eq("id", gameId)
        .maybeSingle();
      if (cancelled) return;
      const mv = (data as { master_volume?: number } | null)?.master_volume ?? 80;
      masterVolume.current = mv;
      // Re-apply to current playing track
      if (currentTrack.current) {
        const active = activeSlot.current === "A" ? playerA.current : playerB.current;
        try { active?.setVolume(Math.round(currentTrack.current.volume * (mv / 100))); } catch { /* noop */ }
      }
    }

    async function loadPlaying() {
      const { data } = await supabase
        .from("music_tracks")
        .select("id,video_id,is_playing,volume,is_sfx,hotkey")
        .eq("game_id", gameId)
        .eq("is_playing", true)
        .eq("is_sfx", false)
        .maybeSingle();
      if (cancelled) return;
      const track = data as TrackRow | null;
      if (!track) { stopCurrent(); return; }
      playTrackWithFade(track);
    }

    void loadMaster();
    void loadPlaying();

    const ch = supabase
      .channel(`music-engine-${gameId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "music_tracks", filter: `game_id=eq.${gameId}` },
        () => void loadPlaying())
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        () => void loadMaster())
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [gameId, ready]);

  // Soundboard hotkeys.
  useEffect(() => {
    if (!ready) return;
    async function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (!key || key.length !== 1) return;
      const { data } = await supabase
        .from("music_tracks")
        .select("id,video_id,volume,hotkey")
        .eq("game_id", gameId)
        .eq("is_sfx", true);
      const match = (data ?? []).find((t) => (t as { hotkey: string | null }).hotkey?.toLowerCase() === key);
      if (!match || !sfxPlayer.current) return;
      const m = match as unknown as TrackRow;
      try {
        sfxPlayer.current.setVolume(Math.round(m.volume * (masterVolume.current / 100)));
        sfxPlayer.current.loadVideoById(m.video_id);
        sfxPlayer.current.playVideo();
      } catch { /* noop */ }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gameId, ready]);

  return (
    <div style={{ position: "fixed", left: -9999, top: -9999, width: 1, height: 1, overflow: "hidden" }} aria-hidden>
      <div ref={containerA} />
      <div ref={containerB} />
      <div ref={sfxContainer} />
    </div>
  );
}
