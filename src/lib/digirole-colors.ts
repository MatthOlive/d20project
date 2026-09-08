const DIGI_ATTRIBUTE_COLORS: Record<string, string> = {
  va: "#22c55e",
  vaccine: "#22c55e",
  da: "#3b82f6",
  data: "#3b82f6",
  vi: "#ef4444",
  virus: "#ef4444",
  no: "#8b8f97",
  none: "#8b8f97",
  fr: "#f59e0b",
  free: "#f59e0b",
  un: "#c084fc",
  unknown: "#c084fc",
  uk: "#c084fc",
};

const FIELD_COLORS: Record<string, string> = {
  dr: "#ef4444",
  vb: "#eab308",
  wg: "#fb7185",
  da: "#9333ea",
  ds: "#2563eb",
  nsp: "#16a34a",
  nso: "#09090b",
  me: "#71717a",
  jt: "#6b7f2a",
  neutras: "#64748b",
  neutra: "#64748b",
  unclassified: "#64748b",
};

function normalized(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]/g, "");
}

export function digiRoleAttributeColor(attribute: string | null | undefined) {
  return DIGI_ATTRIBUTE_COLORS[normalized(attribute)] ?? "#c084fc";
}

export function digiRoleFieldColor(field: string | null | undefined) {
  const key = normalized(field);
  if (FIELD_COLORS[key]) return FIELD_COLORS[key];
  if (key.includes("dragon")) return FIELD_COLORS.dr;
  if (key.includes("virusbuster")) return FIELD_COLORS.vb;
  if (key.includes("windguardian")) return FIELD_COLORS.wg;
  if (key.includes("darkarea")) return FIELD_COLORS.da;
  if (key.includes("deepsaver")) return FIELD_COLORS.ds;
  if (key.includes("naturespirit")) return FIELD_COLORS.nsp;
  if (key.includes("nightmaresoldier")) return FIELD_COLORS.nso;
  if (key.includes("metalempire")) return FIELD_COLORS.me;
  if (key.includes("jungletrooper")) return FIELD_COLORS.jt;
  return "#64748b";
}

export function digiRoleSheetColor(
  fields: string[] | null | undefined,
  attribute: string | null | undefined,
) {
  return fields?.length ? digiRoleFieldColor(fields[0]) : digiRoleAttributeColor(attribute);
}
