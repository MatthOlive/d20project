import { supabase } from "@/integrations/supabase/client";

const ASSET_BUCKET = "game-assets";
export const GAME_ASSET_REF_PREFIX = "storage://game-assets/";

type OptimizeOptions = {
  maxDimension?: number;
  quality?: number;
};

function safeCategory(category: string) {
  return (
    category
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "images"
  );
}

export async function optimizeGameAsset(file: File, options: OptimizeOptions = {}) {
  if (
    !file.type.startsWith("image/") ||
    file.type === "image/svg+xml" ||
    file.type === "image/gif"
  ) {
    return file;
  }

  const maxDimension = options.maxDimension ?? 2048;
  const quality = options.quality ?? 0.82;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "image"}.webp`, {
      type: "image/webp",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

export async function uploadGameAsset(
  file: File,
  category = "images",
  options: OptimizeOptions = {},
) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error("Usuário não autenticado.");

  const optimized = await optimizeGameAsset(file, options);
  const extension =
    optimized.type === "image/webp"
      ? "webp"
      : optimized.name
          .split(".")
          .pop()
          ?.toLowerCase()
          .replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${authData.user.id}/${safeCategory(category)}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, optimized, {
    cacheControl: "300",
    contentType: optimized.type || file.type,
    upsert: false,
  });
  if (error) throw error;

  return `${GAME_ASSET_REF_PREFIX}${path}`;
}

export async function removeGameAsset(reference: string) {
  const path = gameAssetPath(reference);
  if (!path) return;
  const { error } = await supabase.storage.from(ASSET_BUCKET).remove([path]);
  if (error) throw error;
}

export function gameAssetPath(value: string | null | undefined): string | null {
  if (!value?.startsWith(GAME_ASSET_REF_PREFIX)) return null;
  const path = value.slice(GAME_ASSET_REF_PREFIX.length);
  return path && !path.split("/").some((part) => !part || part === "." || part === "..")
    ? path
    : null;
}
