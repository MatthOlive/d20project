import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const envPath = process.argv.find((arg) => arg.startsWith("--env="))?.slice("--env=".length) ?? ".env.migration.local";
const execute = process.argv.includes("--execute");

const env = loadEnv(envPath);
const oldDb = adminClient(env.OLD_SUPABASE_URL, env.OLD_SUPABASE_SERVICE_ROLE_KEY);
const newDb = adminClient(env.NEW_SUPABASE_URL, env.NEW_SUPABASE_SERVICE_ROLE_KEY);
const tempPassword = env.TEMP_USER_PASSWORD || `D20-${randomBytes(12).toString("hex")}!`;

const catalogTables = [
  "abilities",
  "moves",
  "natures",
  "species",
  "species_moves",
  "routes",
  "t20_powers",
  "t20_spells",
];

const dataTables = [
  "profiles",
  "games",
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
  map_backgrounds: ["created_by"],
  card_hands: ["user_id"],
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
  console.error(`\nMigração interrompida: ${error.message}`);
  process.exit(1);
});

async function main() {
  console.log(execute ? "Modo EXECUTAR: vai gravar no Supabase novo." : "Modo TESTE: nada sera gravado. Use --execute para migrar.");
  console.log(`Lendo configuracao de ${envPath}`);

  const userMap = await prepareUsers();

  for (const table of catalogTables) {
    await copyTable(table, userMap);
  }

  for (const table of dataTables) {
    await copyTable(table, userMap);
  }

  await patchDeferredFields(userMap);

  console.log("\nResumo:");
  console.log("  - Catalogos copiados antes dos jogos.");
  console.log("  - Usuarios remapeados por e-mail.");
  console.log("  - Senhas antigas nao sao copiadas pelo Supabase.");
  console.log(execute ? "Migração concluida." : "Teste concluido. Rode novamente com --execute para gravar.");
}

async function prepareUsers() {
  const oldUsers = await listUsers(oldDb, "antigo");
  const newUsers = await listUsers(newDb, "novo");
  const newByEmail = new Map(newUsers.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u]));
  const userMap = new Map();

  console.log(`Usuarios no antigo: ${oldUsers.length}`);
  console.log(`Usuarios no novo: ${newUsers.length}`);

  for (const oldUser of oldUsers) {
    if (!oldUser.email) {
      console.warn(`Usuario antigo sem e-mail ignorado: ${oldUser.id}`);
      continue;
    }

    const email = oldUser.email.toLowerCase();
    const existing = newByEmail.get(email);
    if (existing) {
      userMap.set(oldUser.id, existing.id);
      continue;
    }

    if (!execute) {
      console.log(`[teste] Criaria usuario no novo: ${oldUser.email}`);
      userMap.set(oldUser.id, `DRY_RUN_USER_${oldUser.id}`);
      continue;
    }

    const { data, error } = await newDb.auth.admin.createUser({
      email: oldUser.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: oldUser.user_metadata ?? {},
      app_metadata: oldUser.app_metadata ?? {},
    });

    if (error) throw new Error(`Erro criando usuario ${oldUser.email}: ${error.message}`);
    userMap.set(oldUser.id, data.user.id);
    newByEmail.set(email, data.user);
    console.log(`Usuario criado no novo: ${oldUser.email}`);
  }

  return userMap;
}

async function copyTable(table, userMap) {
  const rows = await readAll(oldDb, table);
  if (rows === null) return;
  if (rows.length === 0) {
    console.log(`${table}: 0 registros`);
    return;
  }

  const transformed = rows.map((row) => transformRow(table, row, userMap, true));
  console.log(`${table}: ${rows.length} registro(s)${execute ? "" : " [teste]"}`);

  if (!execute) return;

  for (const chunk of chunks(transformed, 200)) {
    const query = newDb.from(table).upsert(chunk, {
      onConflict: conflictKeys[table],
      ignoreDuplicates: false,
    });
    const { error } = await query;
    if (error) throw new Error(`Erro gravando ${table}: ${error.message}`);
  }
}

async function patchDeferredFields(userMap) {
  if (!execute) return;

  for (const table of Object.keys(deferredFields)) {
    const rows = await readAll(oldDb, table);
    if (!rows || rows.length === 0) continue;

    for (const row of rows) {
      const patch = {};
      for (const field of deferredFields[table]) {
        if (field in row) patch[field] = row[field];
      }
      if (Object.keys(patch).length === 0) continue;

      const transformedPatch = transformRow(table, patch, userMap, false);
      const match = primaryMatch(table, transformRow(table, row, userMap, false));
      if (!match) continue;

      const { error } = await newDb.from(table).update(transformedPatch).match(match);
      if (error) throw new Error(`Erro atualizando campos finais de ${table}: ${error.message}`);
    }
  }
}

function transformRow(table, row, userMap, clearDeferred) {
  const out = { ...row };

  for (const field of userFields[table] ?? []) {
    if (out[field]) out[field] = mapUserId(userMap, out[field], `${table}.${field}`);
  }

  for (const field of userArrayFields[table] ?? []) {
    if (Array.isArray(out[field])) out[field] = out[field].map((id) => mapUserId(userMap, id, `${table}.${field}`));
  }

  if (clearDeferred) {
    for (const field of deferredFields[table] ?? []) {
      if (field in out) out[field] = null;
    }
  }

  return out;
}

function mapUserId(userMap, oldId, label) {
  const mapped = userMap.get(oldId);
  if (!mapped) throw new Error(`Nao encontrei usuario correspondente para ${label}: ${oldId}`);
  return mapped;
}

async function readAll(client, table) {
  const out = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from(table).select("*").range(from, from + pageSize - 1);
    if (error) {
      if (isMissingTable(error)) {
        console.log(`${table}: tabela nao existe neste projeto, pulando`);
        return null;
      }
      throw new Error(`Erro lendo ${table}: ${error.message}`);
    }
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

async function listUsers(client, label) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Erro lendo usuarios do Supabase ${label}: ${error.message}`);
    users.push(...(data.users ?? []));
    if (!data.users || data.users.length < 1000) break;
  }
  return users;
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

function isMissingTable(error) {
  return error.code === "PGRST205" || error.message?.includes("Could not find the table");
}

function adminClient(url, serviceRoleKey) {
  if (!url || !serviceRoleKey) throw new Error("Preencha URL e SERVICE_ROLE_KEY dos dois Supabases.");
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
