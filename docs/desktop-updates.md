# Desktop auto-updates

The D20 Project desktop app uses Tauri. To avoid sending a new installer manually after every change, enable the official Tauri updater plugin and publish signed update artifacts through GitHub Releases.

## Required pieces

1. A public GitHub Release for each desktop version.
2. A Tauri updater signing key pair.
3. `tauri.conf.json` configured with:
   - `bundle.createUpdaterArtifacts`
   - `plugins.updater.pubkey`
   - `plugins.updater.endpoints`
4. The updater plugin installed in both Rust and JavaScript.

## Why this cannot be skipped

Tauri validates every update with a signature. This protects players from a fake update replacing the app. The private key must be kept outside the repository.

## Recommended release flow

1. Increase the desktop version in:
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
2. Build the desktop app with the Tauri signing key available in the environment.
3. Upload the installer, updater artifact, signature, and `latest.json` to a GitHub Release.
4. The installed app checks the endpoint and installs the update when the release version is newer.

## Endpoint shape

For GitHub Releases, the updater endpoint should look like:

```json
"https://github.com/MatthOlive/d20project/releases/latest/download/latest.json"
```

The `latest.json` file must include the version, platform URL, and signature.
