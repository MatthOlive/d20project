import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile() {
  if (!existsSync(".env")) return;
  const content = readFileSync(".env", "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}

loadEnvFile();

execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  stdio: "inherit",
});

const clientDir = "dist/client";
const { default: server } = await import("../dist/server/server.js");
const response = await server.fetch(new Request("http://d20project.local/"));

if (!response.ok) {
  throw new Error(`Could not render desktop index.html: ${response.status} ${response.statusText}`);
}

let html = await response.text();

html = html
  .replaceAll('"/assets/', '"./assets/')
  .replaceAll('href="/assets/', 'href="./assets/')
  .replaceAll('src="/assets/', 'src="./assets/')
  .replaceAll('href="/manifest.webmanifest"', 'href="./manifest.webmanifest"')
  .replaceAll('href="/pwa-icon-192.svg"', 'href="./pwa-icon-192.svg"')
  .replaceAll('href="/favicon.ico"', 'href="./favicon.ico"');

writeFileSync(join(clientDir, "index.html"), html);
