# Release Process

## Quick Reference

```bash
# Test locally first
npm run tauri build
# Test the app from src-tauri/target/release/bundle/

# Release (stable)
# 1. Update version in tauri.conf.json and SettingsPanel.tsx
# 2. Commit and push
git add -A && git commit -m "release: bump version to X.Y.Z"
git push
git tag vX.Y.Z && git push origin vX.Y.Z

# Pre-release (for testing)
git tag vX.Y.Z-beta.1 && git push origin vX.Y.Z-beta.1
```

## Version Sync Checklist

Before tagging a release, ensure ALL version numbers are updated:

1. **tauri.conf.json** - `src-tauri/tauri.conf.json` → `version` field
2. **SettingsPanel.tsx** - `src/components/SettingsPanel.tsx` → Search for "版本"

## Release Types

### Stable Release (vX.Y.Z)

- Triggers full build and publish
- Updates `latest.json` for auto-updater
- Users will be notified of update

### Pre-release (vX.Y.Z-beta.N or vX.Y.Z-rc.N)

- Triggers full build and publish
- Marked as pre-release on GitHub
- Does NOT update `latest.json` (users won't auto-update)
- Use for testing before stable release

## Workflow

1. Develop and test locally with `npm run tauri dev`
2. Before release, run `npm run tauri build` and test the bundled app
3. Update version numbers
4. Commit and push to main
5. Create and push tag

**Note**: Only tags trigger builds. Pushing to main does NOT trigger a build.

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
- **国内用户**: GitHub 可能被墙，自动更新功能可能无法使用，请手动下载新版本

### App shows "damaged and can't be opened" on macOS

- Run: `xattr -cr /path/to/Pico\ Live\ Assistant.app`
- Or right-click → Open → click "Open" in dialog
- This is because the app isn't notarized with Apple (requires $99/year developer account)

### Build cache not working

- Cache key is based on `Cargo.lock` hash
- If dependencies change, cache is invalidated
- First build after dependency change will be slow, subsequent builds use cache
- Cache is only saved on `main` branch builds to avoid conflicts between parallel tag/main builds
- Tag builds restore from cache but don't save (they use the cache warmed by main)

### Cache warming builds fail with signing error

- Fixed by using `--no-bundle` flag for cache warming builds
- This compiles Rust code (warming the cache) but skips bundling/signing
- Only tag builds create signed bundles

---

## Bundled Resources

The following resources are bundled with the app and do NOT require network access:

### ADB (Android Debug Bridge)

- Location: `resources/adb/` (platform-specific)
- Used for: Connecting to Android emulators
