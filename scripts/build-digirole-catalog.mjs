import fs from "node:fs";
import path from "node:path";

const source = process.argv[2];
const destination = process.argv[3];
if (!source || !destination) {
  throw new Error("Uso: node scripts/build-digirole-catalog.mjs <digirole.txt> <migration.sql>");
}

const raw = fs.readFileSync(source, "utf8").replaceAll("\u0000", "");
const lines = raw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
const stages = new Set([
  "In-Training I",
  "In-Training II",
  "Rookie",
  "Champion",
  "Ultimate",
  "Mega",
  "Mega+",
]);
const attrs = ["strength", "dexterity", "vitality", "wisdom", "spirit", "charisma"];

function pageAt(index) {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const match = lines[cursor].match(/^===== PAGE (\d+) =====$/);
    if (match) return Number(match[1]);
  }
  return null;
}

function nextCardIndex(start) {
  for (let index = start; index < lines.length - 1; index += 1) {
    if (lines[index] === "===== PAGE 183 =====") return index;
    if (stages.has(lines[index + 1]) && pageAt(index) < 183) return index;
  }
  return lines.length;
}

const species = [];
for (let index = 0; index < lines.length - 1; index += 1) {
  if (!stages.has(lines[index + 1])) continue;
  const page = pageAt(index);
  if (!page || page < 28 || page >= 183) continue;
  const end = nextCardIndex(index + 2);
  const block = lines.slice(index, end);
  const statStart = block.findIndex(
    (_, offset) =>
      offset > 3 && attrs.every((__, attrIndex) => /^\d+$/.test(block[offset + attrIndex] ?? "")),
  );
  if (statStart < 0) continue;
  const hpIndex = block.findIndex((line) => /^\d+; HP sugerido \d+/i.test(line));
  const hpMatch = hpIndex >= 0 ? block[hpIndex].match(/^(\d+); HP sugerido (\d+)/i) : null;
  const typeParts = (block[2] ?? "None / Unknown").split("/").map((part) => part.trim());
  const marker = block.findIndex((line, offset) => offset > statStart && line === "FIELD");
  const techniqueName = block[statStart + 6] ?? "Técnica assinatura";
  const cost = Number(block[statStart + 7]?.match(/(\d+)\s*DS/i)?.[1] ?? 0);
  const field = marker >= 0 ? (block[marker + 4] ?? "Neutra") : "Neutra";
  const category = marker >= 0 ? (block[marker + 5] ?? "Energia") : "Energia";
  const accuracy = marker >= 0 ? (block[marker + 6] ?? "DEX + Fight") : "DEX + Fight";
  const damage = marker >= 0 ? (block[marker + 7] ?? null) : null;
  const descriptionMarker = marker >= 0 ? block.indexOf("DESCRIÇÃO", marker) : -1;
  const routeMarker = descriptionMarker >= 0 ? block.indexOf("—", descriptionMarker + 1) : -1;
  const description =
    descriptionMarker >= 0
      ? block
          .slice(descriptionMarker + 1, routeMarker >= 0 ? routeMarker : descriptionMarker + 4)
          .join(" ")
      : "";
  const secondDescription = routeMarker >= 0 ? block.indexOf("DESCRIÇÃO", routeMarker + 1) : -1;
  const evolutionText = secondDescription >= 0 ? block.slice(secondDescription + 1).join(" ") : "";
  const fields = (block[4] ?? "Unclassified")
    .split(/[\/,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const availableFields = (block[3] ?? "")
    .split(/,| e /)
    .map((part) => part.replace(/\.$/, "").trim())
    .filter(Boolean);
  const stabilization = hpIndex >= 0 ? (block[hpIndex + 1] ?? "") : "";
  const stabilizationVictories = Number(stabilization.match(/(\d+)\s+vit/i)?.[1] ?? 0);
  species.push({
    name: block[0],
    stage: block[1],
    digi_attribute: typeParts[0] || "None",
    species_type: typeParts[1] || null,
    fields,
    available_fields: availableFields,
    hp_base: Number(hpMatch?.[1] ?? 3),
    suggested_hp: Number(hpMatch?.[2] ?? 0) || null,
    stabilization_text: stabilization,
    stabilization_victories: stabilizationVictories,
    base_attrs: Object.fromEntries(
      attrs.map((attr, attrIndex) => [attr, Number(block[statStart + attrIndex])]),
    ),
    signature_technique: techniqueName,
    evolution_text: evolutionText,
    source_page: page,
    signature: {
      name: techniqueName,
      origin: block[0],
      grade: null,
      ds_cost: cost,
      field,
      category,
      target: "1 alvo",
      accuracy_formula: accuracy,
      damage_formula: damage,
      description,
      source_page: page,
    },
  });
  index = end - 1;
}

const techniques = [];
for (let index = 0; index < lines.length - 7; index += 1) {
  const page = pageAt(index);
  if (!page || page < 183) continue;
  if (!/^\d+\s*DS$/i.test(lines[index + 1])) continue;
  if (!/^(?:I|II|III|IV|V|VI|VII)\s*\//.test(lines[index + 2])) continue;
  if (lines[index + 6] !== "DESCRIÇÃO") continue;
  let end = index + 7;
  while (
    end < lines.length - 1 &&
    !(
      /^\d+\s*DS$/i.test(lines[end + 1]) &&
      /^(?:I|II|III|IV|V|VI|VII)\s*\//.test(lines[end + 2] ?? "")
    )
  ) {
    if (/^===== PAGE \d+ =====$/.test(lines[end])) {
      end += 2;
      continue;
    }
    end += 1;
  }
  const [grade, field] = lines[index + 2].split("/").map((part) => part.trim());
  const [category, target] = lines[index + 3].split("/").map((part) => part.trim());
  const description = lines
    .slice(index + 7, end)
    .filter((line) => !/^DIGIROLE\s+•/.test(line) && !/^===== PAGE \d+ =====$/.test(line))
    .join(" ");
  techniques.push({
    name: lines[index],
    origin: description.match(/Origem:\s*([^\.]+)\./i)?.[1]?.trim() ?? "",
    grade,
    ds_cost: Number(lines[index + 1].match(/\d+/)?.[0] ?? 0),
    field,
    category,
    target: target || "1 alvo",
    accuracy_formula: lines[index + 4],
    damage_formula: lines[index + 5],
    description,
    source_page: page,
  });
  index = end - 1;
}

const uniqueTechniques = new Map();
for (const technique of [...species.map((entry) => entry.signature), ...techniques]) {
  technique.origin ??= "";
  technique.grade ??= "";
  const key = `${technique.name}|${technique.origin ?? ""}|${technique.grade ?? ""}`;
  uniqueTechniques.set(key, technique);
}
const uniqueSpecies = new Map();
for (const entry of species) {
  delete entry.signature;
  uniqueSpecies.set(entry.name.trim().toLocaleLowerCase("pt-BR"), entry);
}

const speciesRows = [...uniqueSpecies.values()];
const techniqueRows = [...uniqueTechniques.values()];
const batchesOf = (rows, size = 100) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size),
  );

const json = (value) => JSON.stringify(value).replaceAll("$catalog$", "$ catalog $");
const speciesSql = batchesOf(speciesRows)
  .map((batch) => `insert into public.digirole_species (name,stage,digi_attribute,species_type,fields,available_fields,hp_base,suggested_hp,stabilization_text,stabilization_victories,base_attrs,signature_technique,evolution_text,source_page)\nselect name,stage,digi_attribute,species_type,fields,available_fields,hp_base,suggested_hp,stabilization_text,stabilization_victories,base_attrs,signature_technique,evolution_text,source_page\nfrom jsonb_to_recordset($catalog$${json(batch)}$catalog$::jsonb) as x(name text,stage text,digi_attribute text,species_type text,fields text[],available_fields text[],hp_base integer,suggested_hp integer,stabilization_text text,stabilization_victories integer,base_attrs jsonb,signature_technique text,evolution_text text,source_page integer)\non conflict (name) do update set stage=excluded.stage,digi_attribute=excluded.digi_attribute,species_type=excluded.species_type,fields=excluded.fields,available_fields=excluded.available_fields,hp_base=excluded.hp_base,suggested_hp=excluded.suggested_hp,stabilization_text=excluded.stabilization_text,stabilization_victories=excluded.stabilization_victories,base_attrs=excluded.base_attrs,signature_technique=excluded.signature_technique,evolution_text=excluded.evolution_text,source_page=excluded.source_page;`)
  .join("\n\n");
const techniquesSql = batchesOf(techniqueRows)
  .map((batch) => `insert into public.digirole_techniques (name,origin,grade,ds_cost,field,category,target,accuracy_formula,damage_formula,description,source_page)\nselect name,origin,grade,ds_cost,field,category,target,accuracy_formula,damage_formula,description,source_page\nfrom jsonb_to_recordset($catalog$${json(batch)}$catalog$::jsonb) as x(name text,origin text,grade text,ds_cost integer,field text,category text,target text,accuracy_formula text,damage_formula text,description text,source_page integer)\non conflict (name,origin,grade) do update set ds_cost=excluded.ds_cost,field=excluded.field,category=excluded.category,target=excluded.target,accuracy_formula=excluded.accuracy_formula,damage_formula=excluded.damage_formula,description=excluded.description,source_page=excluded.source_page;`)
  .join("\n\n");
const sql = `-- Generated from DigiRole.pdf. Do not edit catalog rows by hand.\n\n${speciesSql}\n\n${techniquesSql}\n`;

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, sql, "utf8");
process.stdout.write(
  JSON.stringify({ species: speciesRows.length, techniques: techniqueRows.length, destination }),
);
