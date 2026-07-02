import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  stdio: "inherit",
});

const clientDir = "dist/client";
const assetsDir = join(clientDir, "assets");
const serverAssetsDir = "dist/server/assets";

const manifestFile = readdirSync(serverAssetsDir).find((file) =>
  file.startsWith("_tanstack-start-manifest_") && file.endsWith(".js"),
);

if (!manifestFile) {
  throw new Error("TanStack Start manifest not found after build.");
}

const manifestSource = readFileSync(join(serverAssetsDir, manifestFile), "utf8");
const rootScriptMatch = manifestSource.match(/src:\s*"\/(assets\/[^"]+\.js)"/);

if (!rootScriptMatch) {
  throw new Error("Could not find the client entry script in the TanStack Start manifest.");
}

const stylesheet = readdirSync(assetsDir).find((file) =>
  file.startsWith("styles-") && file.endsWith(".css"),
);

if (!stylesheet) {
  throw new Error("Could not find the compiled stylesheet.");
}

const entryScript = rootScriptMatch[1];
const html = `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>D20 Project</title>
    <link rel="stylesheet" href="./assets/${stylesheet}" />
  </head>
  <body class="bg-background text-foreground">
    <div id="root"></div>
    <script type="module" async src="./${entryScript}"></script>
  </body>
</html>
`;

writeFileSync(join(clientDir, "index.html"), html);
