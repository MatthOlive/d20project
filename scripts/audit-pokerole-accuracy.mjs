import { readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = "tmp/pokerole-reference";
const revision = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dir = `${root}/v2.0/Moves`;
const records = await Promise.all((await readdir(dir)).filter(f => f.endsWith(".json")).map(async f => JSON.parse(await readFile(`${dir}/${f}`, "utf8"))));
const attrs = new Set(["strength", "dexterity", "special", "vitality", "insight", "will", "tough", "cute", "cool", "beautiful", "clever"]);
const skills = new Set(["brawl", "channel", "alert", "allure", "athletic", "empathy", "etiquette", "evasion", "intimidate", "medicine", "nature", "perform", "stealth"]);
const normalize = s => (s ?? "").trim().toLowerCase().replaceAll("beauty", "beautiful");
const pairs = {};
const special = [];
for (const r of records.sort((a, b) => a.Name.localeCompare(b.Name))) {
  const a = normalize(r.Accuracy1), s = normalize(r.Accuracy2);
  const fixed = a && a.split("/").every(v => attrs.has(v)) && s && s.split("/").every(v => skills.has(v));
  pairs[r.Name.toLowerCase()] = fixed ? [a, s] : [null, null];
  if (!fixed) special.push({ name: r.Name, attribute: r.Accuracy1, skill: r.Accuracy2 });
}
const path = "src/lib/pokerole.ts";
const source = await readFile(path, "utf8");
const start = source.indexOf("// Accuracy formulas verified");
const end = source.indexOf("export function correctedMoveAccuracy", start);
if (start < 0 || end < 0) throw new Error("Missing accuracy catalog markers");
const catalog = `// Accuracy formulas verified against Pokerole-Data v2.0/Moves.\n// Source revision: ${revision}. Null pairs require an explicit pool.\nconst MOVE_ACCURACY_CORRECTIONS: Record<string, [string | null, string | null]> = ${JSON.stringify(pairs, null, 2)};\n\n`;
await writeFile(path, source.slice(0, start) + catalog + source.slice(end));
const sql = await readFile("supabase/migrations/20260805120000_paldea_hisui_pokerole_catalog.sql", "utf8");
const local = JSON.parse(sql.match(/\$moves\$([\s\S]*?)\$moves\$/)[1]);
const missing = local.filter(r => !Object.hasOwn(pairs, r.name.toLowerCase())).map(r => r.name);
const changed = local.filter(r => { const p = pairs[r.name.toLowerCase()]; return p && (p[0] !== r.accuracy_stat || p[1] !== r.accuracy_skill); }).map(r => ({ name: r.name, before: [r.accuracy_stat, r.accuracy_skill], after: pairs[r.name.toLowerCase()] }));
await writeFile("output/pokerole-accuracy-audit.json", JSON.stringify({ revision, referenceCount: records.length, importedCount: local.length, changes: changed, special, outsideReference: missing }, null, 2));
console.log(JSON.stringify({ reference: records.length, imported: local.length, corrections: changed.length, special, outsideReference: missing }, null, 2));
