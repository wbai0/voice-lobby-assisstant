# Release Process

When creating a new release for the Pico Live Assistant app:

## Version Sync Checklist

Before tagging a release, ensure ALL version numbers are updated:

1. **tauri.conf.json** - `src-tauri/tauri.conf.json` → `version` field
   - This determines artifact filenames and updater version
2. **App.tsx** - `src/App.tsx` → Search for "版本" to find the display version
   - This is what users see in the settings panel

## Release Steps

1. Develop and push to `main` (builds run to warm cache, no release created)
2. When ready to release:
   - Update version in `src-tauri/tauri.conf.json`
   - Update version display in `src/App.tsx`
   - Commit with message: `release: bump version to X.Y.Z`
   - Push to main
   - Create and push tag: `git tag vX.Y.Z && git push origin vX.Y.Z`

**Important**: Don't create tags for every small change. Tags trigger full releases. Regular commits to `main` build the cache without creating releases.

## Notes

- Git tag triggers the GitHub Actions build workflow
- Artifact names come from tauri.conf.json, NOT the git tag
- The updater uses tauri.conf.json version to determine if updates are available

---

## Architecture Decision: Public Releases Repo

**Decision**: Use a separate public GitHub repo for releases while keeping source code private.

**Why**:

- Private repos don't allow public access to release assets
- The Tauri updater needs to fetch `latest.json` and download artifacts without authentication
- Gist approach doesn't work because download URLs would still point to private repo

**Setup**:

1. Public repo: `wbai0/pico-releases` (contains only release artifacts, no source code)
2. Private repo: `wbai0/voice-lobby-assisstant` (source code)
3. GitHub Actions workflow copies release artifacts to public repo after build
4. Updater endpoint points to: `https://github.com/wbai0/pico-releases/releases/latest/download/latest.json`

---

## GitHub Secrets Reference

The following secrets are configured in the private repo (`voice-lobby-assisstant`) under Settings → Secrets and variables → Actions:

### RELEASE_TOKEN

**Purpose**: Allows GitHub Actions to publish releases to the public `pico-releases` repo.

**How it was created**:

1. Go to https://github.com/settings/tokens (Classic tokens)
2. Generate new token (classic)
3. Name: `pico-releases`
4. Expiration: No expiration (for convenience)
5. Scopes: `repo` (full control of private repositories)
6. Copy token and add as secret `RELEASE_TOKEN` in the private repo

**When to regenerate**: If compromised or if you want to rotate for security.

### TAURI_SIGNING_PRIVATE_KEY

**Purpose**: Signs the app updates so the Tauri updater can verify authenticity. Without this, auto-updates won't work.

**How it was created**:

```bash
npm run tauri signer generate -- -w ~/.tauri/pico.key
```

This generates:

- Private key: `~/.tauri/pico.key` (keep secret, used for signing)
- Public key: printed to console (stored in `tauri.conf.json` under `plugins.updater.pubkey`)

**Value**: The contents of the private key file (base64 encoded)

### TAURI_SIGNING_PRIVATE_KEY_PASSWORD

**Purpose**: Password to decrypt the private signing key (if one was set during generation).

**Value**: The password entered when generating the key, or empty string if no password was set.

---

## Troubleshooting

### "检查更新失败: Could not fetch a valid release JSON"

- Check that `pico-releases` repo is public
- Verify `latest.json` exists in the latest release
- Check the endpoint URL in `tauri.conf.json`

### App shows "damaged and can't be opened" on macOS

- Run: `xattr -cr /path/to/Pico\ Live\ Assistant.app`
- Or right-click → Open → click "Open" in dialog
- This is because the app isn't notarized with Apple (requires $99/year developer account)

### Build cache not working

- Cache key is based on `Cargo.lock` hash
- If dependencies change, cache is invalidated
- First build after dependency change will be slow, subsequent builds use cache
