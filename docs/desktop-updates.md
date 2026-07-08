# Desktop auto-updates

The D20 Project desktop app uses the official Tauri updater plugin. Updates are distributed through GitHub Releases.

Official references:

- Tauri updater: https://v2.tauri.app/plugin/updater/
- Tauri process/relaunch plugin: https://v2.tauri.app/plugin/process/
- GitHub Releases: https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository
- GitHub Actions secrets: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions

## Current setup

- Updater public key is configured in `src-tauri/tauri.conf.json`.
- The app checks for updates from:
  `https://github.com/MatthOlive/d20project/releases/latest/download/latest.json`
- The private signing key was generated outside the repository at:
  `C:\Users\REFORCEL\Documents\Codex\d20-updater-private.key`
- The key has no password.

Keep the private key secret. Do not commit it.

## GitHub setup required once

Go to:

`MatthOlive/d20project` -> `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

Create these secrets:

1. `TAURI_SIGNING_PRIVATE_KEY`
   - Value: the full contents of:
     `C:\Users\REFORCEL\Documents\Codex\d20-updater-private.key`

2. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   - Value: leave it empty if GitHub allows it.
   - If GitHub does not allow an empty secret, do not create this secret; the workflow can be adjusted to omit it.

## Creating a new release

1. Increase the version in both files:
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`

2. Commit and push the version change.

3. In GitHub, open:
   `Actions` -> `Desktop Release` -> `Run workflow`

4. Type the matching tag, for example:
   `v0.2.3`

5. Run the workflow.

The workflow will:

- build the Windows installer,
- sign the updater artifact,
- generate `latest.json`,
- create/update the GitHub Release,
- upload the installer, signature, and updater manifest.

## What players experience

Players install the updater-enabled app once. After that, when a newer GitHub Release exists, the app can download and install the update from inside D20 Project.

## Local signed build

For local testing on this machine:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content 'C:\Users\REFORCEL\Documents\Codex\d20-updater-private.key') -join "`n"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
node .\node_modules\@tauri-apps\cli\tauri.js build --ci
node .\scripts\make-tauri-latest-json.mjs v0.2.2
```
