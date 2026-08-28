import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const generatedTypes = await readFile(
  path.join(srcRoot, "integrations", "supabase", "types.ts"),
  "utf8",
);
const schemaExtensions = await readFile(
  path.join(srcRoot, "integrations", "supabase", "schema.ts"),
  "utf8",
);
const declaredSchema = `${generatedTypes}\n${schemaExtensions}`;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(fullPath)));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

const usedTables = new Set();
const usedFunctions = new Set();
for (const file of await sourceFiles(srcRoot)) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/\bsupabase\s*\.\s*from\(\s*["']([a-zA-Z0-9_]+)["']/g)) {
    usedTables.add(match[1]);
  }
  for (const match of source.matchAll(/\bsupabase\s*\.\s*rpc\(\s*["']([a-zA-Z0-9_]+)["']/g)) {
    usedFunctions.add(match[1]);
  }
}

function missingDeclarations(names) {
  return [...names].filter((name) => !new RegExp(`\\b${name}\\s*:`).test(declaredSchema)).sort();
}

const missingTables = missingDeclarations(usedTables);
const missingFunctions = missingDeclarations(usedFunctions);
if (missingTables.length || missingFunctions.length) {
  if (missingTables.length) console.error(`Tabelas sem tipo: ${missingTables.join(", ")}`);
  if (missingFunctions.length) console.error(`Funções sem tipo: ${missingFunctions.join(", ")}`);
  process.exit(1);
}

console.log(
  `Tipos Supabase cobrem ${usedTables.size} tabelas e ${usedFunctions.size} funções usadas diretamente.`,
);
