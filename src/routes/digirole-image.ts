import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import sharp from "sharp";

const ALLOWED_IMAGE_HOSTS = new Set([
  "digimon.net",
  "www.digimon.net",
  "digi-api.com",
  "www.digi-api.com",
  "digimon.shadowsmith.com",
]);
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 4096 * 4096;

function isBackgroundPixel(data: Uint8Array, offset: number) {
  const alpha = data[offset + 3];
  if (alpha < 8) return true;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const darkest = Math.min(red, green, blue);
  const lightest = Math.max(red, green, blue);
  return darkest >= 224 && lightest - darkest <= 24;
}

function removeBorderWhite(data: Uint8Array, width: number, height: number) {
  const total = width * height;
  const queued = new Uint8Array(total);
  const queue = new Uint32Array(total);
  let head = 0;
  let tail = 0;

  function enqueue(index: number) {
    if (queued[index] || !isBackgroundPixel(data, index * 4)) return;
    queued[index] = 1;
    queue[tail++] = index;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const offset = index * 4;
    const alpha = data[offset + 3];
    if (alpha >= 8) {
      const darkest = Math.min(data[offset], data[offset + 1], data[offset + 2]);
      const opacity = Math.max(0, Math.min(1, (251 - darkest) / 27));
      data[offset + 3] = Math.round(alpha * opacity);
    } else {
      data[offset + 3] = 0;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
}

async function transparentPng(source: ArrayBuffer) {
  const { data, info } = await sharp(Buffer.from(source), { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  removeBorderWhite(data, info.width, info.height);
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}

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
          const png = await transparentPng(source);
          return new Response(new Uint8Array(png), {
            headers: {
              "Content-Type": "image/png",
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
