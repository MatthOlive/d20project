import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const envPath = argValue("--env") ?? ".env.migration.local";
const dataDir = argValue("--data") ?? "migration-data";
const usersPath = argValue("--users") ?? join(dataDir, "user-map.csv");
const execute = process.argv.includes("--execute");

const env = loadEnv(envPath);
const db = adminClient(env.NEW_SUPABASE_URL, env.NEW_SUPABASE_SERVICE_ROLE_KEY);
const userMap = loadUserMap(usersPath);

const tables = [
  "abilities",
  "moves",
  "natures",
  "species",
  "species_moves",
  "routes",
  "t20_powers",
  "t20_spells",
  "games",
  "profiles",
  "game_members",
  "scenarios",
  "trainers",
  "pokemon",
  "trainer_moves",
  "pokemon_moves",
  "t20_characters",
  "t20_character_powers",
  "t20_character_spells",
  "map_backgrounds",
  "map_drawings",
  "fog_regions",
  "walls",
  "tokens",
  "initiative",
  "chat_messages",
  "music_tracks",
  "macros",
  "knowledge_chunks",
  "decks",
  "cards",
  "card_hands",
  "card_discards",
];

const conflictKeys = {
  abilities: "id",
  moves: "id",
  natures: "id",
  species: "id",
  species_moves: "species_id,move_id",
  routes: "id",
  profiles: "id",
  games: "id",
  game_members: "game_id,user_id",
  scenarios: "id",
  trainers: "id",
  pokemon: "id",
  trainer_moves: "trainer_id,move_id",
  pokemon_moves: "pokemon_id,move_id",
  t20_characters: "id",
  t20_powers: "id",
  t20_spells: "id",
  t20_character_powers: "character_id,power_id",
  t20_character_spells: "character_id,spell_id",
  map_backgrounds: "id",
  map_drawings: "id",
  fog_regions: "id",
  walls: "id",
  tokens: "id",
  initiative: "id",
  chat_messages: "id",
  music_tracks: "id",
  macros: "id",
  knowledge_chunks: "id",
  decks: "id",
  cards: "id",
  card_hands: "deck_id,user_id",
  card_discards: "deck_id,card_id",
};

const userFields = {
  profiles: ["id"],
  games: ["narrator_id"],
  game_members: ["user_id"],
  trainers: ["owner_id"],
  pokemon: ["owner_id"],
  t20_characters: ["owner_id"],
  chat_messages: ["user_id"],
  macros: ["user_id"],
  card_hands: ["user_id"],
};

const nullableUserFields = {
  map_backgrounds: ["created_by"],
};

const userArrayFields = {
  trainers: ["allowed_editors"],
  pokemon: ["allowed_editors"],
  t20_characters: ["allowed_editors"],
};

const deferredFields = {
  games: ["active_page_id", "current_scenario_id"],
  game_members: ["viewing_page_id"],
};

main().catch((error) => {
  console.error(`\nImportacao interrompida: ${error.message}`);
  process.exit(1);
});

async function main() {
  console.log(execute ? "Modo EXECUTAR: vai gravar no Supabase novo." : "Modo TESTE: nada sera gravado. Use --execute para importar.");
  console.log(`Dados: ${dataDir}`);
  console.log(`Mapa de usuarios: ${usersPath}`);
  console.log(`Usuarios mapeados: ${userMap.size}`);

  const deferredRows = new Map();

  for (const table of tables) {
    const rows = loadRows(table);
    if (!rows) continue;

    const transformed = rows
      .map((row) => transformRow(table, row, true))
      .filter(Boolean);

    if ((deferredFields[table] ?? []).length) {
      deferredRows.set(table, rows);
    }

    console.log(`${table}: ${rows.length} lido(s), ${transformed.length} pronto(s)${execute ? "" : " [teste]"}`);
    if (!execute || transformed.length === 0) continue;

    await upsertRows(table, transformed);
  }

  if (execute) {
    await patchDeferredRows(deferredRows);
  }

  console.log(execute ? "\nImportacao concluida." : "\nTeste concluido. Rode com --execute para gravar.");
}

function loadRows(table) {
  const candidates = [
    join(dataDir, `${table}.json`),
    join(dataDir, `public.${table}.json`),
    join(dataDir, `${table}.csv`),
    join(dataDir, `public.${table}.csv`),
    ...exportedFileCandidates(table),
  ];

  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) {
    console.log(`${table}: arquivo nao encontrado, pulando`);
    return null;
  }

  const raw = readFileSync(path, "utf8");
  if (path.toLowerCase().endsWith(".csv")) return parseCsv(raw);

  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.rows)) return parsed.rows;
  if (Array.isArray(parsed.data)) return parsed.data;
  throw new Error(`${path} precisa ser uma lista JSON ou ter "rows"/"data".`);
}

function exportedFileCandidates(table) {
  if (!existsSync(dataDir)) return [];

  const prefixes = [`${table}-export-`, `public.${table}-export-`];
  return readdirSync(dataDir)
    .filter((name) => prefixes.some((prefix) => name.startsWith(prefix)))
    .filter((name) => name.endsWith(".csv") || name.endsWith(".json"))
    .sort()
    .map((name) => join(dataDir, name));
}

function transformRow(table, row, clearDeferred) {
  const out = { ...row };

  for (const field of userFields[table] ?? []) {
    if (!out[field]) continue;
    out[field] = mapUserId(out[field], `${table}.${field}`, false);
  }

  for (const field of nullableUserFields[table] ?? []) {
    if (!out[field]) continue;
    out[field] = mapUserId(out[field], `${table}.${field}`, true);
  }

  for (const field of userArrayFields[table] ?? []) {
    if (!Array.isArray(out[field])) continue;
    out[field] = out[field]
      .map((id) => mapUserId(id, `${table}.${field}`, true))
      .filter(Boolean);
  }

  if (clearDeferred) {
    for (const field of deferredFields[table] ?? []) {
      if (field in out) out[field] = null;
    }
  }

  return out;
}

async function patchDeferredRows(deferredRows) {
  for (const [table, rows] of deferredRows.entries()) {
    for (const row of rows) {
      const patch = {};
      for (const field of deferredFields[table] ?? []) {
        if (field in row) patch[field] = row[field];
      }
      if (Object.keys(patch).length === 0) continue;

      const transformedPatch = transformRow(table, patch, false);
      const transformedRow = transformRow(table, row, false);
      const match = primaryMatch(table, transformedRow);
      if (!match) continue;

      const { error } = await db.from(table).update(transformedPatch).match(match);
      if (error) throw new Error(`Erro atualizando referencias finais de ${table}: ${error.message}`);
    }
  }
}

async function upsertRows(table, rows) {
  for (const chunk of chunks(rows, 200)) {
    const { error } = await db.from(table).upsert(chunk, {
      onConflict: conflictKeys[table],
      ignoreDuplicates: false,
    });

    if (error) throw new Error(`Erro gravando ${table}: ${error.message}`);
  }
}

function mapUserId(oldId, label, allowNull) {
  const mapped = userMap.get(String(oldId).toLowerCase());
  if (!mapped) {
    if (allowNull) {
      console.warn(`Sem mapa para ${label}: ${oldId}. Gravando como null/removendo.`);
      return null;
    }
    throw new Error(`Sem mapa para ${label}: ${oldId}. Adicione no ${usersPath}.`);
  }
  return mapped;
}

function loadUserMap(path) {
  if (!existsSync(path)) throw new Error(`Arquivo de mapa de usuarios nao encontrado: ${path}`);

  const text = readFileSync(path, "utf8");
  const map = new Map();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (index === 0 && trimmed.toLowerCase().includes("old")) continue;

    const separator = trimmed.includes(";") ? ";" : ",";
    const [oldId, newId] = trimmed.split(separator).map((part) => part?.trim());
    if (!oldId || !newId) throw new Error(`Linha invalida em ${path}: ${line}`);
    map.set(oldId.toLowerCase(), newId);
  }

  return map;
}

function parseCsv(text) {
  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const headers = rows.shift().map((header) => header.trim());
  return rows
    .filter((values) => values.some((value) => value.trim() !== ""))
    .map((values) => {
      const out = {};
      headers.forEach((header, index) => {
        out[header] = parseCell(values[index] ?? "");
      });
      return out;
    });
}

function detectCsvDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function parseCell(value) {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed === "null" || trimmed === "NULL") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function primaryMatch(table, row) {
  const key = conflictKeys[table];
  if (!key) return row.id ? { id: row.id } : null;
  return Object.fromEntries(key.split(",").map((field) => [field, row[field]]));
}

function chunks(rows, size) {
  const result = [];
  for (let index = 0; index < rows.length; index += size) {
    result.push(rows.slice(index, index + size));
  }
  return result;
}

function adminClient(url, serviceRoleKey) {
  if (!url || !serviceRoleKey) throw new Error("Preencha NEW_SUPABASE_URL e NEW_SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function loadEnv(path) {
  const raw = readFileSync(path, "utf8");
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, "");
    result[key] = value;
  }
  return result;
}

function argValue(name) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}
