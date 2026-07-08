import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repo = process.env.GITHUB_REPOSITORY ?? "MatthOlive/d20project";
const tag = process.env.GITHUB_REF_NAME ?? process.argv[2];
const bundleDir = process.argv[3] ?? "src-tauri/target/release/bundle/nsis";

if (!tag) {
  throw new Error("Missing release tag. Pass it as the first argument or set GITHUB_REF_NAME.");
}

const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const version = config.version;
const files = readdirSync(bundleDir);
const installer = files.find((name) => name.includes(`_${version}_`) && name.endsWith("_x64-setup.exe"));

if (!installer) {
  throw new Error(`No NSIS setup executable found in ${bundleDir}`);
}

const signaturePath = join(bundleDir, `${installer}.sig`);
if (!existsSync(signaturePath)) {
  throw new Error(`No updater signature found for ${installer}`);
}

const signature = readFileSync(signaturePath, "utf8").trim();
const encodedInstaller = installer.replaceAll(" ", "%20");
const url = `https://github.com/${repo}/releases/download/${tag}/${encodedInstaller}`;

const latest = {
  version,
  notes: `D20 Project ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url,
    },
  },
};

writeFileSync(join(bundleDir, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`);
console.log(`Created ${join(bundleDir, "latest.json")}`);
