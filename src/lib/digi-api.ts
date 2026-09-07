const DIGI_API_BASE = "https://digi-api.com/api/v1";

type DigiApiResponse = {
  images?: Array<{ href?: string | null }>;
};

type DigiApiListEntry = {
  id?: number | string;
  name?: string | null;
  href?: string | null;
  image?: string | null;
  images?: Array<{ href?: string | null }>;
};

type DigiApiListResponse = {
  content?: DigiApiListEntry[];
};

const imageCache = new Map<string, Promise<string | null>>();
const AUTOMATIC_IMAGE_HOSTS = new Set([
  "digi-api.com",
  "www.digi-api.com",
  "digimon.shadowsmith.com",
]);

export function transparentDigiRoleImageUrl(value: string | null | undefined) {
  if (!value || value.startsWith("/digirole-image?")) return value ?? null;
  try {
    const url = new URL(value, "http://localhost");
    if (!AUTOMATIC_IMAGE_HOSTS.has(url.hostname)) return value;
    return `/digirole-image?src=${encodeURIComponent(url.href)}`;
  } catch {
    return value;
  }
}

function validImage(value: string | null | undefined) {
  return value && /^https?:\/\//i.test(value) ? value : null;
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

function legacyImageUrl(name: string) {
  const slug = normalizedName(name)
    .replace(/\bx antibody\b/g, "x")
    .replace(/[^a-z0-9]+/g, "");
  return slug ? `https://digimon.shadowsmith.com/img/${slug}.jpg` : null;
}

function directDigiApiImageUrl(name: string) {
  const clean = name.replace(/\s+/g, " ").trim();
  return clean ? `https://digi-api.com/images/digimon/w/${encodeURIComponent(clean)}.png` : null;
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

function nameCandidates(name: string) {
  const clean = name.replace(/\s+/g, " ").trim();
  return [
    clean,
    clean.replace(/\s+\(x\)$/i, " (X-Antibody)"),
    clean.replace(/\s+x$/i, " (X-Antibody)"),
    clean.replace(/\s*\[[^\]]+]\s*$/g, "").trim(),
  ].filter((candidate, index, values) => candidate && values.indexOf(candidate) === index);
}

function entryImage(entry: DigiApiListEntry) {
  return (
    validImage(entry.image) ??
    entry.images?.map((image) => validImage(image.href)).find(Boolean) ??
    null
  );
}

function matchScore(entry: DigiApiListEntry, query: string) {
  const entryName = normalizedName(entry.name ?? "");
  const queryName = normalizedName(query);
  if (!entryName || !queryName) return 0;
  if (entryName === queryName) return 100;
  const queryTokens = queryName.split(" ");
  if (queryTokens.every((token) => entryName.includes(token))) return 80;
  if (entryName.startsWith(queryName) || queryName.startsWith(entryName)) return 60;
  return 0;
}

async function fetchDetail(path: string) {
  const response = await fetch(path);
  if (!response.ok) return null;
  const data = (await response.json()) as DigiApiResponse;
  return data.images?.map((image) => validImage(image.href)).find(Boolean) ?? null;
}

async function resolveDigiApiImage(name: string): Promise<string | null> {
  const candidates = nameCandidates(name);
  for (const candidate of candidates) {
    try {
      const image = await fetchDetail(`${DIGI_API_BASE}/digimon/${encodeURIComponent(candidate)}`);
      if (image) return image;
    } catch {
      // Continue with the searchable catalog fallback.
    }
  }

  for (const candidate of candidates) {
    try {
      const response = await fetch(
        `${DIGI_API_BASE}/digimon?name=${encodeURIComponent(candidate)}&pageSize=30`,
      );
      if (!response.ok) continue;
      const data = (await response.json()) as DigiApiListResponse;
      const matches = [...(data.content ?? [])].sort(
        (left, right) => matchScore(right, candidate) - matchScore(left, candidate),
      );
      const selected = matches.find((entry) => matchScore(entry, candidate) > 0) ?? matches[0];
      if (!selected) continue;
      const image = entryImage(selected);
      if (image) return image;
      if (validImage(selected.href)) {
        const detailImage = await fetchDetail(selected.href!);
        if (detailImage) return detailImage;
      }
      if (selected.id != null) {
        const detailImage = await fetchDetail(`${DIGI_API_BASE}/digimon/${selected.id}`);
        if (detailImage) return detailImage;
      }
    } catch {
      // Try the next spelling variation.
    }
  }
  return firstLoadableImage([directDigiApiImageUrl(name), legacyImageUrl(name)]);
}

export async function fetchDigiApiImage(name: string): Promise<string | null> {
  const cleanName = name.trim();
  if (!cleanName) return null;
  const key = normalizedName(cleanName);
  const cached = imageCache.get(key);
  if (cached) return cached;
  const pending = resolveDigiApiImage(cleanName);
  imageCache.set(key, pending);
  return pending;
}
