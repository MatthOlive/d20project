import { digimonNetImageUrl } from "@/lib/digimon-net-images.generated";

const imageCache = new Map<string, Promise<string | null>>();
const AUTOMATIC_IMAGE_HOSTS = new Set([
  "digimon.net",
  "www.digimon.net",
  "digi-api.com",
  "www.digi-api.com",
  "digimon.shadowsmith.com",
]);

export function transparentDigiRoleImageUrl(value: string | null | undefined) {
  if (!value || value.startsWith("/digirole-image?")) return value ?? null;
  try {
    const url = new URL(value, "http://localhost");
    // Desktop/Tauri builds do not expose the web server route used by the
    // browser preview. Official image hosts are safe to load directly and
    // this keeps the installed app independent from that route.
    if (AUTOMATIC_IMAGE_HOSTS.has(url.hostname)) return url.href;
    return value;
  } catch {
    return value;
  }
}

function normalizedName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/x[- ]?antibody/g, "x antibody")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function firstLoadableImage(candidates: Array<string | null>) {
  if (typeof Image === "undefined") return candidates.find(Boolean) ?? null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const loaded = await new Promise<boolean>((resolve) => {
      const image = new Image();
      const timeout = window.setTimeout(() => resolve(false), 5000);
      image.onload = () => {
        window.clearTimeout(timeout);
        resolve(true);
      };
      image.onerror = () => {
        window.clearTimeout(timeout);
        resolve(false);
      };
      image.src = candidate;
    });
    if (loaded) return candidate;
  }
  return null;
}

export async function fetchDigimonNetImage(name: string): Promise<string | null> {
  const cleanName = name.trim();
  if (!cleanName) return null;
  const key = normalizedName(cleanName);
  const cached = imageCache.get(key);
  if (cached) return cached;
  const pending = firstLoadableImage([digimonNetImageUrl(cleanName)]);
  imageCache.set(key, pending);
  return pending;
}

// Kept for compatibility with existing DigiRole components.
export const fetchDigiApiImage = fetchDigimonNetImage;
