import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const migrationDirectory = path.resolve("supabase/migrations");
const migrationName = /^(\d{14})_.+\.sql$/;
const forbiddenArtifacts = [
  /Warning: truncated output/i,
  /bytes omitted/i,
  /original token count/i,
  /tokens truncated/i,
  /^<{7}|^={7}|^>{7}/m,
];

const files = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort((left, right) => left.localeCompare(right));
const errors = [];
const timestamps = new Map();

for (const file of files) {
  const match = file.match(migrationName);
  if (!match) {
    errors.push(`${file}: nome inválido; use AAAAMMDDhhmmss_descricao.sql.`);
    continue;
  }

  const timestamp = match[1];
  const existing = timestamps.get(timestamp);
  if (existing) errors.push(`${file}: timestamp duplicado com ${existing}.`);
  else timestamps.set(timestamp, file);

  const sql = await readFile(path.join(migrationDirectory, file), "utf8");
  if (!sql.trim()) errors.push(`${file}: arquivo vazio.`);
  for (const artifact of forbiddenArtifacts) {
    if (artifact.test(sql))
      errors.push(`${file}: contém artefato de saída truncada ou conflito de merge.`);
  }

  const dollarTags = sql.match(/\$\$|\$[A-Za-z_][A-Za-z0-9_]*\$/g) ?? [];
  const tagCounts = new Map();
  for (const tag of dollarTags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  for (const [tag, count] of tagCounts) {
    if (count % 2 !== 0) errors.push(`${file}: delimitador SQL ${tag} não está balanceado.`);
  }

  const transactionBegins = (sql.match(/^\s*begin;\s*$/gim) ?? []).length;
  const transactionCommits = (sql.match(/^\s*commit;\s*$/gim) ?? []).length;
  if (transactionBegins !== transactionCommits) {
    errors.push(
      `${file}: transações desequilibradas (${transactionBegins} begin, ${transactionCommits} commit).`,
    );
  }
}

if (errors.length > 0) {
  console.error(`Falha na verificação de ${files.length} migrações:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(`${files.length} migrações verificadas sem artefatos estruturais.`);
