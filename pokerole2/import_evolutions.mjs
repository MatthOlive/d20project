// Bulk-import evolution speeds/methods for species from a spreadsheet.
//
// Usage:  node pokerole2/import_evolutions.mjs
// Env:    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required
//         DRY_RUN=1 to preview without writing
//
// Drop a file at pokerole2/evolutions.xlsx (preferred) or pokerole2/evolutions.csv.
// See pokerole2/README.md for the expected column layout.

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}
const sb = createClient(url, key);
const dryRun = process.env.DRY_RUN === "1";

const here = path.dirname(new URL(import.meta.url).pathname);
const xlsxPath = path.join(here, "evolutions.xlsx");
const csvPath = path.join(here, "evolutions.csv");

function parseCsv(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return rows;
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const obj = {};
    header.forEach((h, idx) => { obj[h] = cells[idx] ?? ""; });
    rows.push(obj);
  }
  return rows;
}

async function readRows() {
  if (fs.existsSync(xlsxPath)) {
    let XLSX;
    try { XLSX = await import("xlsx"); } catch {
      console.error("Found evolutions.xlsx but the 'xlsx' package is not installed.");
      console.error("Install it once with:  bun add -d xlsx");
      process.exit(1);
    }
    const wb = XLSX.readFile(xlsxPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    return json.map((r) => {
      const out = {};
      for (const [k, v] of Object.entries(r)) out[String(k).trim().toLowerCase()] = String(v ?? "").trim();
      return out;
    });
  }
  if (fs.existsSync(csvPath)) return parseCsv(fs.readFileSync(csvPath, "utf8"));
  console.error("No pokerole2/evolutions.xlsx or pokerole2/evolutions.csv found.");
  process.exit(1);
}

function normalizeSpeed(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "f" || s === "fast" || s === "5") return "fast";
  if (s === "m" || s === "medium" || s === "15") return "medium";
  if (s === "s" || s === "slow" || s === "45") return "slow";
  return null;
}

function buildMethod(row) {
  const kind = String(row.evolution_kind || "").trim().toLowerCase();
  if (!kind) return null;
  if (kind === "time") {
    const speed = normalizeSpeed(row.evolution_speed);
    if (!speed) return null;
    return { kind: "time", speed };
  }
  if (kind === "item" || kind === "other") {
    const text = String(row.evolution_text || "").trim();
    if (!text) return null;
    return { kind, text };
  }
  return null;
}

const rows = await readRows();
console.log(`Loaded ${rows.length} rows from ${fs.existsSync(xlsxPath) ? "evolutions.xlsx" : "evolutions.csv"}.`);

let ok = 0, missing = 0, skipped = 0, failed = 0;
for (const row of rows) {
  const name = String(row.name || "").trim();
  if (!name) { skipped++; continue; }
  const method = buildMethod(row);
  if (!method) { skipped++; continue; }
  if (dryRun) { console.log(`[dry] ${name} →`, method); ok++; continue; }
  const { data, error } = await sb
    .from("species")
    .update({ evolution_method: method })
    .ilike("name", name)
    .select("id");
  if (error) { failed++; console.error(name, error.message); continue; }
  if (!data || data.length === 0) { missing++; console.warn(`no species match for: ${name}`); continue; }
  ok++;
}

console.log(`\nDone — updated=${ok} missing=${missing} skipped=${skipped} failed=${failed}${dryRun ? " (dry run)" : ""}`);
