# Release Process

When creating a new release for the Pico Live Assistant app:

## Version Sync Checklist

Before tagging a release, ensure ALL version numbers are updated:

1. **tauri.conf.json** - `src-tauri/tauri.conf.json` → `version` field
   - This determines artifact filenames and updater version
2. **App.tsx** - `src/App.tsx` → Search for "版本" to find the display version
   - This is what users see in the settings panel

## Release Steps

1. Update version in `src-tauri/tauri.conf.json`
2. Update version display in `src/App.tsx`
3. Commit with message: `release: bump version to X.Y.Z`
4. Create and push tag: `git tag vX.Y.Z && git push origin vX.Y.Z`

## Notes

- Git tag triggers the GitHub Actions build workflow
- Artifact names come from tauri.conf.json, NOT the git tag
- The updater uses tauri.conf.json version to determine if updates are available
