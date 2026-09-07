import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const ALLOWED_IMAGE_HOSTS = new Set([
  "digimon.net",
  "www.digimon.net",
  "digi-api.com",
  "www.digi-api.com",
  "digimon.shadowsmith.com",
]);
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export const Route = createFileRoute("/digirole-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let sourceUrl: URL | null = null;
        try {
          const sourceValue = new URL(request.url).searchParams.get("src");
          if (!sourceValue) return new Response("Imagem não informada.", { status: 400 });
          sourceUrl = new URL(sourceValue);
          if (sourceUrl.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(sourceUrl.hostname)) {
            return new Response("Fonte de imagem não permitida.", { status: 403 });
          }

          const upstream = await fetch(sourceUrl, {
            headers: {
              Accept: "image/png,image/jpeg,image/webp,image/*",
              Referer: "https://digimon.net/",
              "User-Agent": "D20Project/1.0",
            },
            signal: AbortSignal.timeout(10_000),
          });
          if (!upstream.ok) return Response.redirect(sourceUrl.href, 307);
          const declaredSize = Number(upstream.headers.get("content-length") ?? 0);
          if (declaredSize > MAX_SOURCE_BYTES) {
            return new Response("Imagem muito grande.", { status: 413 });
          }
          const source = await upstream.arrayBuffer();
          if (source.byteLength > MAX_SOURCE_BYTES) {
            return new Response("Imagem muito grande.", { status: 413 });
          }
          // Keep this route compatible with the Cloudflare/Workers runtime.
          // Image transformation used to rely on native `sharp`, which can
          // make the entire image endpoint fail in production. The official
          // source already returns a valid browser image, so proxy its bytes
          // without transforming them.
          return new Response(source, {
            headers: {
              "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
              "Cache-Control": "public, max-age=604800, immutable",
            },
          });
        } catch {
          // The browser may still reach the image host when the preview server cannot.
          if (sourceUrl) return Response.redirect(sourceUrl.href, 307);
          return new Response("Não foi possível preparar a imagem.", { status: 502 });
        }
      },
    },
  },
});
