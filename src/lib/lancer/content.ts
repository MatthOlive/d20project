import { strFromU8, unzipSync } from "fflate";
import type {
  LancerCompendiumItem,
  LancerContentType,
  LancerEffectDefinition,
  LancerGameActionDefinition,
  LancerTriggerDefinition,
} from "@/lib/lancer/types";

export type ParsedLcpItem = Pick<
  LancerCompendiumItem,
  "item_type" | "external_id" | "name" | "description" | "data" | "action_definitions" | "effect_definitions" | "trigger_definitions"
>;

export type ParsedLcp = {
  manifest: Record<string, unknown>;
  items: ParsedLcpItem[];
  warnings: string[];
};

const FILE_TYPES: Record<string, LancerContentType> = {
  frames: "frame",
  frame: "frame",
  weapons: "weapon",
  mech_weapons: "weapon",
  systems: "system",
  mech_systems: "system",
  pilot_gear: "pilot_gear",
  pilot_armor: "pilot_armor",
  talents: "talent",
  licenses: "license",
  core_bonuses: "core_bonus",
  manufacturers: "manufacturer",
  npc_classes: "npc_class",
  npc_templates: "npc_template",
  npc_features: "npc_feature",
  statuses: "status",
  conditions: "condition",
  tags: "tag",
  actions: "action",
  reserves: "reserve",
  sitreps: "sitreps",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("\n");
  return "";
}

function contentTypeFromPath(path: string): LancerContentType {
  const stem = path.split("/").pop()?.replace(/\.json$/i, "").toLowerCase() ?? "";
  return FILE_TYPES[stem] ?? "other";
}

function normalizeActions(item: Record<string, unknown>, itemId: string): LancerGameActionDefinition[] {
  const candidates = Array.isArray(item.actions)
    ? item.actions
    : Array.isArray(item.profiles)
      ? item.profiles
      : [];
  return candidates.map((candidate, index) => {
    const action = asRecord(candidate);
    const activationValue = String(action.activation ?? action.action_type ?? (Array.isArray(item.profiles) ? "quick" : "other")).toLowerCase();
    const activation = activationValue.includes("protocol") ? "protocol"
      : activationValue.includes("reaction") ? "reaction"
        : activationValue.includes("quick") ? "quick"
          : activationValue.includes("full") ? "full"
            : activationValue.includes("free") ? "free"
              : "other";
    const damage = Array.isArray(action.damage)
      ? action.damage.map((entry) => {
          const value = asRecord(entry);
          return { type: String(value.type ?? "kinetic"), expression: String(value.val ?? value.expression ?? "0") };
        })
      : [];
    return {
      id: String(action.id ?? `${itemId}:action:${index}`),
      name: String(action.name ?? item.name ?? "Action"),
      sourceId: itemId,
      activation,
      attackType: (action.attack_type ?? null) as LancerGameActionDefinition["attackType"],
      targetType: String(action.target_type ?? action.target ?? "self"),
      range: Array.isArray(action.range)
        ? action.range.map((entry) => {
            const value = asRecord(entry);
            return { type: String(value.type ?? "range"), value: Number(value.val ?? value.value ?? 0) };
          })
        : [],
      roll: typeof action.roll === "string" ? action.roll : null,
      damage,
      effects: Array.isArray(action.effects) ? action.effects.map(asRecord) : [],
      resourceCosts: asRecord(action.resource_costs) as Record<string, number>,
      triggers: Array.isArray(action.triggers) ? action.triggers.map(String) : [],
      frequency: (action.frequency ?? null) as LancerGameActionDefinition["frequency"],
    };
  });
}

function normalizeEffects(item: Record<string, unknown>, itemId: string): LancerEffectDefinition[] {
  if (!Array.isArray(item.effects)) return [];
  return item.effects.map((candidate, index) => {
    const effect = asRecord(candidate);
    return {
      id: String(effect.id ?? `${itemId}:effect:${index}`),
      kind: String(effect.kind ?? effect.type ?? "custom") as LancerEffectDefinition["kind"],
      target: typeof effect.target === "string" ? effect.target : null,
      value: typeof effect.value === "number" || typeof effect.value === "string" ? effect.value : null,
      condition: asRecord(effect.condition),
      metadata: effect,
    };
  });
}

function normalizeTriggers(item: Record<string, unknown>, itemId: string): LancerTriggerDefinition[] {
  if (!Array.isArray(item.triggers)) return [];
  return item.triggers.map((candidate, index) => {
    const trigger = asRecord(candidate);
    return {
      id: String(trigger.id ?? `${itemId}:trigger:${index}`),
      event: String(trigger.event ?? trigger.trigger ?? "custom"),
      optional: Boolean(trigger.optional),
      effects: normalizeEffects({ effects: trigger.effects }, `${itemId}:trigger:${index}`),
      frequency: (trigger.frequency ?? null) as LancerTriggerDefinition["frequency"],
    };
  });
}

function normalizeItem(raw: unknown, type: LancerContentType, fallbackIndex: number): ParsedLcpItem | null {
  const item = asRecord(raw);
  const externalId = String(item.id ?? item.lid ?? item.key ?? `${type}-${fallbackIndex}`);
  const name = String(item.name ?? item.title ?? externalId).trim();
  if (!name) return null;
  return {
    item_type: type,
    external_id: externalId,
    name,
    description: text(item.description ?? item.effect ?? item.detail) || null,
    data: item,
    action_definitions: normalizeActions(item, externalId),
    effect_definitions: normalizeEffects(item, externalId),
    trigger_definitions: normalizeTriggers(item, externalId),
  };
}

export async function parseLcpFile(file: File): Promise<ParsedLcp> {
  if (!file.name.toLowerCase().endsWith(".lcp")) throw new Error("Selecione um arquivo .lcp.");
  if (file.size > 50 * 1024 * 1024) throw new Error("O pacote excede o limite de 50 MB.");
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const entries = Object.entries(archive).filter(([path]) => path.toLowerCase().endsWith(".json"));
  const manifestEntry = entries.find(([path]) => /(^|\/)manifest\.json$/i.test(path));
  if (!manifestEntry) throw new Error("O pacote não possui manifest.json.");
  let manifest: Record<string, unknown>;
  try {
    manifest = asRecord(JSON.parse(strFromU8(manifestEntry[1])));
  } catch {
    throw new Error("O manifest.json do pacote é inválido.");
  }
  if (!String(manifest.name ?? "").trim() || !String(manifest.version ?? "").trim()) {
    throw new Error("O manifesto precisa informar name e version.");
  }

  const items: ParsedLcpItem[] = [];
  const warnings: string[] = [];
  for (const [path, bytes] of entries) {
    if (path === manifestEntry[0]) continue;
    try {
      const parsed = JSON.parse(strFromU8(bytes));
      const type = contentTypeFromPath(path);
      const candidates = Array.isArray(parsed) ? parsed : Object.values(asRecord(parsed)).find(Array.isArray) ?? [];
      if (!Array.isArray(candidates)) continue;
      candidates.forEach((candidate, index) => {
        const normalized = normalizeItem(candidate, type, index);
        if (normalized) items.push(normalized);
      });
    } catch {
      warnings.push(`${path}: JSON ignorado por estar inválido.`);
    }
  }
  if (items.length === 0) warnings.push("Nenhum item de compêndio reconhecido no pacote.");
  if (items.length > 10_000) throw new Error("O pacote excede o limite de 10.000 itens.");
  return { manifest, items, warnings };
}

export const CompConAdapter = {
  toCompendiumItem(raw: unknown, type: LancerContentType, index = 0) {
    return normalizeItem(raw, type, index);
  },
};
