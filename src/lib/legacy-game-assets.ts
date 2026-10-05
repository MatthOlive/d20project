import { supabase } from "@/integrations/supabase/client";
import { optimizeGameAsset, removeGameAsset, uploadGameAsset } from "@/lib/game-assets";

type ImageRow = { id: string; image_url: string | null };
type BackgroundRow = { id: string; background_url: string | null };

const IMAGE_TABLES = [
  "trainers",
  "pokemon",
  "digirole_tamers",
  "digirole_digimons",
  "tokens",
  "initiative",
  "map_backgrounds",
] as const;
const BACKGROUND_TABLES = ["games", "scenarios"] as const;

function isDataImage(value: string | null): value is string {
  return !!value && /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(value);
}

function decodeDataImage(value: string, id: string): File {
  const [header, payload] = value.split(",", 2);
  const mime = header.match(/^data:(image\/[a-z0-9.+-]+);base64$/i)?.[1];
  if (!mime || !payload) throw new Error("Formato Base64 de imagem inválido.");
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const extension = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
  return new File([bytes], `${id}.${extension}`, { type: mime });
}

async function fetchRows<T>(table: string, field: string): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 250;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await (supabase
      .from(table as never)
      .select(`id,${field}`)
      // Keep the one-time migration from downloading every remote sprite/URL
      // across every visible record. Only legacy inline images need transfer.
      .like(field, "data:image/%")
      .range(from, from + pageSize - 1) as unknown as Promise<{
      data: T[] | null;
      error: { message: string } | null;
    }>);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < pageSize) return all;
  }
}

async function updateField(table: string, id: string, field: string, value: string) {
  const { data, error } = await (supabase
    .from(table as never)
    .update({ [field]: value } as never)
    .eq("id", id)
    .select("id") as unknown as Promise<{
    data: Array<{ id: string }> | null;
    error: { message: string } | null;
  }>);
  if (error) throw new Error(`${table}/${id}: ${error.message}`);
  if (!data?.length)
    throw new Error(`${table}/${id}: sem permissão de edição (a imagem original foi mantida).`);
}

async function migrate(table: string, row: ImageRow | BackgroundRow, field: string, value: string) {
  const file = decodeDataImage(value, row.id);
  const optimized = await optimizeGameAsset(file, {
    maxDimension: 2048,
    quality: 0.82,
  });
  const assetRef = await uploadGameAsset(optimized, `legacy-${table}`, {
    maxDimension: 2048,
    quality: 0.82,
  });
  try {
    await updateField(table, row.id, field, assetRef);
  } catch (error) {
    // Do not leave an inaccessible orphan in Storage when the row update is
    // rejected by RLS or a trigger; the database copy remains untouched.
    await removeGameAsset(assetRef).catch(() => undefined);
    throw error;
  }
  return optimized.size;
}

export type LegacyAssetMigrationResult = {
  migrated: number;
  failed: string[];
  originalBytes: number;
  uploadedBytes: number;
};

export async function migrateLegacyGameAssets(
  onProgress: (completed: number, total: number) => void,
): Promise<LegacyAssetMigrationResult> {
  const pending: Array<{
    table: string;
    row: ImageRow | BackgroundRow;
    field: string;
    value: string;
  }> = [];
  for (const table of IMAGE_TABLES) {
    for (const row of await fetchRows<ImageRow>(table, "image_url")) {
      if (isDataImage(row.image_url))
        pending.push({ table, row, field: "image_url", value: row.image_url });
    }
  }
  for (const table of BACKGROUND_TABLES) {
    for (const row of await fetchRows<BackgroundRow>(table, "background_url")) {
      if (isDataImage(row.background_url))
        pending.push({ table, row, field: "background_url", value: row.background_url });
    }
  }

  const result: LegacyAssetMigrationResult = {
    migrated: 0,
    failed: [],
    originalBytes: pending.reduce(
      (sum, item) => sum + Math.ceil(item.value.split(",", 2)[1].length * 0.75),
      0,
    ),
    uploadedBytes: 0,
  };
  for (const [index, item] of pending.entries()) {
    try {
      result.uploadedBytes += await migrate(item.table, item.row, item.field, item.value);
      result.migrated += 1;
    } catch (error) {
      result.failed.push(
        `${item.table}/${item.row.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    onProgress(index + 1, pending.length);
  }
  return result;
}
