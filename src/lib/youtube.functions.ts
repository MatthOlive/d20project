import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).slice(0, 11) || null;
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => ["embed", "shorts", "v", "live"].includes(p));
      if (idx >= 0 && parts[idx + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[idx + 1])) {
        return parts[idx + 1];
      }
    }
  } catch { /* not a URL */ }
  return null;
}

export const lookupYouTubeVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ query: z.string().min(1).max(500) }).parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) throw new Error("YOUTUBE_API_KEY not configured");

    const videoId = extractVideoId(data.query);

    if (videoId) {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`,
      );
      if (!res.ok) throw new Error(`YouTube API ${res.status}`);
      const json = await res.json() as { items?: Array<{ snippet: { title: string; thumbnails: { medium?: { url: string }; default?: { url: string } } } }> };
      const item = json.items?.[0];
      if (!item) throw new Error("Video não encontrado");
      return {
        videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      };
    }

    // Search by query
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(data.query)}&key=${apiKey}`,
    );
    if (!res.ok) throw new Error(`YouTube search ${res.status}`);
    const json = await res.json() as { items?: Array<{ id: { videoId: string }; snippet: { title: string; thumbnails: { medium?: { url: string }; default?: { url: string } } } }> };
    const item = json.items?.[0];
    if (!item) throw new Error("Nenhum resultado encontrado");
    return {
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
    };
  });
