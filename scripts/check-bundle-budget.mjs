import { access, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const OUTPUT_CANDIDATES = [
  join(process.cwd(), "dist", "client", "assets"),
  join(process.cwd(), ".output", "public", "assets"),
];
const MAX_SINGLE_JS_BYTES = 900 * 1024;
const MAX_TOTAL_JS_BYTES = 2.5 * 1024 * 1024;

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(path) : [path];
    }),
  );
  return nested.flat();
}

async function findOutputRoot() {
  for (const directory of OUTPUT_CANDIDATES) {
    try {
      await access(directory);
      return directory;
    } catch {
      // Try the next supported build output.
    }
  }
  throw new Error("Nenhuma pasta de build do cliente foi encontrada. Execute o build primeiro.");
}

const outputRoot = await findOutputRoot();
const files = (await collectFiles(outputRoot)).filter((file) => file.endsWith(".js"));
const sizes = await Promise.all(
  files.map(async (file) => ({ file, bytes: (await stat(file)).size })),
);
const total = sizes.reduce((sum, item) => sum + item.bytes, 0);
const oversized = sizes.filter((item) => item.bytes > MAX_SINGLE_JS_BYTES);

if (oversized.length > 0 || total > MAX_TOTAL_JS_BYTES) {
  for (const item of oversized) {
    console.error(
      `Pacote acima do limite: ${relative(process.cwd(), item.file)} (${Math.ceil(item.bytes / 1024)} KB)`,
    );
  }
  if (total > MAX_TOTAL_JS_BYTES)
    console.error(`JavaScript total acima do limite: ${Math.ceil(total / 1024)} KB`);
  process.exitCode = 1;
} else {
  console.log(
    `Orçamento do pacote aprovado: ${sizes.length} arquivos, ${Math.ceil(total / 1024)} KB no total.`,
  );
}
