import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const releases = "https://github.com/MatthOlive/d20project/releases/latest";
export const Route = createFileRoute("/download/pc")({
  server: { handlers: { GET: async () => {
    try {
      const response = await fetch(`${releases}/download/latest.json`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("Release manifest unavailable");
      const manifest = await response.json();
      const url = new URL(manifest.platforms?.["windows-x86_64"]?.url);
      if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith("/MatthOlive/d20project/releases/download/") || !url.pathname.endsWith(".exe")) {
        throw new Error("Invalid installer URL");
      }
      return new Response(null, { status: 302, headers: { Location: url.href, "Cache-Control": "no-store" } });
    } catch {
      // The release page remains usable if the manifest is missing or GitHub is unavailable.
      return new Response(null, { status: 302, headers: { Location: releases, "Cache-Control": "no-store" } });
    }
  } } },
});
