import { supabase } from "@/integrations/supabase/client";

type Technique = {
  id: string;
  name: string;
  origin: string;
  grade: string;
  ds_cost: number;
  field: string;
  category: string;
  target: string;
  accuracy_formula: string;
  damage_formula: string | null;
  description: string;
};

type TechniqueIdentity = Pick<
  Technique,
  | "name"
  | "grade"
  | "ds_cost"
  | "field"
  | "category"
  | "target"
  | "accuracy_formula"
  | "damage_formula"
  | "description"
> & { learnedSource?: "signature" | "learned" };

function normalizedTechniquePart(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("pt-BR");
}

export function digiRoleTechniqueMechanicalKey(technique: TechniqueIdentity) {
  return [
    technique.name,
    technique.ds_cost,
    technique.field,
    technique.category,
    technique.target,
    technique.accuracy_formula,
    technique.damage_formula,
  ]
    .map((part) => normalizedTechniquePart(String(part ?? "")))
    .join("|");
}

export function dedupeDigiRoleTechniques<T extends TechniqueIdentity>(techniques: T[]): T[] {
  const unique = new Map<string, T>();
  for (const technique of techniques) {
    const key = digiRoleTechniqueMechanicalKey(technique);
    const current = unique.get(key);
    if (!current) {
      unique.set(key, technique);
      continue;
    }
    const currentScore = (current.grade.trim() ? 10_000 : 0) + current.description.length;
    const candidateScore = (technique.grade.trim() ? 10_000 : 0) + technique.description.length;
    const preferred = candidateScore > currentScore ? technique : current;
    unique.set(key, {
      ...preferred,
      learnedSource:
        current.learnedSource === "signature" || technique.learnedSource === "signature"
          ? "signature"
          : preferred.learnedSource,
    });
  }
  return [...unique.values()];
}

export type DigiRoleSpeciesTechniqueLink = {
  technique_id: string;
  is_signature: boolean;
};

function table(name: string) {
  // DigiRole catalog tables intentionally extend the generated client schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from(name as never) as any;
}

function missingSpeciesTechniqueTable(error: { code?: string; message?: string } | null) {
  return (
    !!error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /digirole_species_techniques/i.test(error.message ?? ""))
  );
}

export async function fetchDigiRoleSpeciesTechniqueIds(speciesId: string): Promise<string[]> {
  const links = await fetchDigiRoleSpeciesTechniqueLinks(speciesId);
  return links.map((link) => link.technique_id);
}

export async function fetchDigiRoleSpeciesTechniqueLinks(
  speciesId: string,
): Promise<DigiRoleSpeciesTechniqueLink[]> {
  const result = await table("digirole_species_techniques")
    .select("technique_id,is_signature")
    .eq("species_id", speciesId);
  if (result.error) {
    if (missingSpeciesTechniqueTable(result.error)) return [];
    throw result.error;
  }
  return (result.data ?? []) as DigiRoleSpeciesTechniqueLink[];
}

export async function fetchDigiRoleSignatureTechniqueIds(): Promise<string[]> {
  const result = await table("digirole_species_techniques")
    .select("technique_id")
    .eq("is_signature", true);
  if (result.error) {
    if (missingSpeciesTechniqueTable(result.error)) return [];
    throw result.error;
  }
  return [
    ...new Set<string>(
      ((result.data ?? []) as Array<{ technique_id: string }>).map((row) => row.technique_id),
    ),
  ];
}

export async function fetchDigiRoleSpeciesSignatureTechniqueIds(
  speciesId: string,
): Promise<string[]> {
  const links = await fetchDigiRoleSpeciesTechniqueLinks(speciesId);
  return [...new Set(links.filter((link) => link.is_signature).map((link) => link.technique_id))];
}

export async function fetchDigiRoleSignatureTechniqueId({
  speciesId,
  signatureName,
  speciesName,
}: {
  speciesId: string;
  signatureName: string | null;
  speciesName: string;
}): Promise<string | null> {
  const linkedIds = await fetchDigiRoleSpeciesSignatureTechniqueIds(speciesId);
  if (linkedIds.length > 0) return linkedIds[0];
  if (!signatureName) return null;

  const fallback = await table("digirole_techniques")
    .select("id,origin,source_page")
    .eq("name", signatureName)
    .order("source_page", { nullsFirst: false })
    .limit(50);
  if (fallback.error) throw fallback.error;
  const candidates = (fallback.data ?? []) as Array<{
    id: string;
    origin: string;
    source_page: number | null;
  }>;
  const exactOrigin = candidates.find(
    (technique) =>
      technique.origin.toLocaleLowerCase("pt-BR") === speciesName.toLocaleLowerCase("pt-BR"),
  );
  return exactOrigin?.id ?? candidates[0]?.id ?? null;
}

export async function syncDigiRoleSignatureTechniques({
  digimonId,
  speciesId,
  signatureName,
  speciesName,
}: {
  digimonId: string;
  speciesId: string;
  signatureName: string | null;
  speciesName: string;
}): Promise<string[]> {
  let techniqueIds = await fetchDigiRoleSpeciesSignatureTechniqueIds(speciesId);
  if (techniqueIds.length === 0) {
    const fallbackId = await fetchDigiRoleSignatureTechniqueId({
      speciesId,
      signatureName,
      speciesName,
    });
    if (fallbackId) techniqueIds = [fallbackId];
  }

  const cleared = await table("digirole_digimon_techniques")
    .delete()
    .eq("digimon_id", digimonId)
    .eq("source", "signature");
  if (cleared.error) throw cleared.error;

  if (techniqueIds.length > 0) {
    const inserted = await table("digirole_digimon_techniques").upsert(
      techniqueIds.map((techniqueId) => ({
        digimon_id: digimonId,
        technique_id: techniqueId,
        source: "signature",
      })),
      { onConflict: "digimon_id,technique_id" },
    );
    if (inserted.error) throw inserted.error;
  }
  return techniqueIds;
}

export async function fetchDigiRoleSpeciesTechniques({
  speciesId,
  signatureName,
  speciesName,
}: {
  speciesId: string;
  signatureName: string | null;
  speciesName: string;
}): Promise<Technique[]> {
  const ids = await fetchDigiRoleSpeciesTechniqueIds(speciesId);
  if (ids.length) {
    const linked = await table("digirole_techniques").select("*").in("id", ids).order("name");
    if (linked.error) throw linked.error;
    return dedupeDigiRoleTechniques((linked.data ?? []) as Technique[]);
  }

  const [originResult, signatureId] = await Promise.all([
    table("digirole_techniques").select("*").eq("origin", speciesName).order("name"),
    fetchDigiRoleSignatureTechniqueId({ speciesId, signatureName, speciesName }),
  ]);
  if (originResult.error) throw originResult.error;
  const techniques = (originResult.data ?? []) as Technique[];
  if (signatureId && !techniques.some((technique) => technique.id === signatureId)) {
    const signature = await table("digirole_techniques")
      .select("*")
      .eq("id", signatureId)
      .maybeSingle();
    if (signature.error) throw signature.error;
    if (signature.data) techniques.push(signature.data as Technique);
  }
  return dedupeDigiRoleTechniques(techniques);
}
