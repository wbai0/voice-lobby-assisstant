# OCR Implementation

## Overview

The app uses Tesseract OCR to recognize text on screen, primarily for finding UI elements like the "发送" (Send) button.

## Architecture

We use **Tesseract CLI** instead of linking the Tesseract library directly. This approach:

- Avoids complex C++ library compilation during build
- More stable across platforms (no crashes from library issues)
- Easier to update Tesseract version independently

## How It Works

1. Take screenshot via ADB: `adb exec-out screencap -p`
2. Save to temp file
3. Call Tesseract CLI: `tesseract image.png stdout -l chi_sim`
4. Parse output text or TSV (for position detection)

## Directory Structure

```
src-tauri/resources/
├── tesseract-macos/
│   ├── tesseract (binary, optional - can use Homebrew)
│   └── tessdata/
│       ├── chi_sim.traineddata
│       └── eng.traineddata
└── tesseract-windows/
    ├── tesseract.exe
    ├── *.dll (all required DLLs)
    └── tessdata/
        ├── chi_sim.traineddata
        └── eng.traineddata
```

## Platform-Specific Behavior

### macOS

1. First checks for bundled tesseract in `App.app/Contents/Resources/tesseract/`
2. Falls back to Homebrew: `/opt/homebrew/bin/tesseract` or `/usr/local/bin/tesseract`
3. Uses system tessdata if using Homebrew tesseract

**Development**: Just install via Homebrew:

```bash
brew install tesseract tesseract-lang
```

### Windows

1. Checks for bundled tesseract in `exe_dir/tesseract/tesseract.exe`
2. Development mode checks `resources/tesseract-windows/tesseract.exe`
3. Always uses bundled tessdata (no system fallback)

**Setup**: Download from UB Mannheim and copy files to `resources/tesseract-windows/`

## Tauri Resource Bundling

In `tauri.conf.json`:

```json
"resources": {
  "resources/tesseract-macos/**/*": "tesseract/",
  "resources/tesseract-windows/**/*": "tesseract/"
}
```

Both platforms' resources are listed, but only matching files get bundled (empty directories are skipped).

## Performance Notes

- **Screenshot**: 2-10+ seconds (depends on emulator, biggest bottleneck)
- **OCR**: ~1 second
- **Total**: Usually 3-12 seconds

The screenshot time varies wildly based on emulator load. Using `exec-out` instead of `shell` is faster.

## Key Functions in `ocr.rs`

- `get_tesseract_exe()` - Find tesseract binary
- `get_tessdata_dir()` - Find tessdata, returns `(path, is_bundled)`
- `ocr_screen(device)` - Screenshot + OCR
- `find_text_position(device, text)` - Find text coordinates using TSV output
- `cmd_test_ocr()` - Tauri command for testing OCR from frontend

## Troubleshooting

### "未找到 Tesseract"

- macOS: `brew install tesseract tesseract-lang`
- Windows: Ensure all DLLs are copied alongside tesseract.exe

### "chi_sim 初始化失败"

- Check tessdata directory has `chi_sim.traineddata`
- File should be ~40MB, smaller means corrupted

### OCR very slow

- Screenshot is the bottleneck, not OCR
- Try different emulator or restart it
- Consider using fixed coordinates instead of OCR for known UI elements

## Windows Testing Setup

### Step 1: Download Tesseract

1. Go to https://github.com/UB-Mannheim/tesseract/wiki
2. Download `tesseract-ocr-w64-setup-5.5.0.20241111.exe` (64-bit)
3. Run installer, select "Chinese Simplified" in language options

### Step 2: Copy Files

From the Tesseract install directory (e.g., `C:\Program Files\Tesseract-OCR\`), copy to `src-tauri/resources/tesseract-windows/`:

```
tesseract-windows/
├── tesseract.exe
├── *.dll (all DLL files, ~15 files)
└── tessdata/
    ├── chi_sim.traineddata (~40MB)
    └── eng.traineddata (~4MB)
```

Required DLLs typically include:

- archive.dll, bz2.dll, gif.dll, jpeg62.dll
- leptonica-_.dll, libcrypto-_.dll, libcurl-\*.dll
- liblzma.dll, libpng16.dll, libssl-\*.dll
- lz4.dll, tesseract\*.dll, tiff.dll
- turbojpeg.dll, webp.dll, zlib1.dll, zstd.dll

### Step 3: Test

```powershell
cd operations
npm run tauri dev
```

1. Connect emulator
2. Go to Settings → Test OCR
3. Check diagnostics modal for any errors

### Verify Tesseract Works Standalone

```powershell
cd src-tauri/resources/tesseract-windows
.\tesseract.exe --version
```

Should show version info without errors.

## Future Improvements

- Cache button positions after first detection
- Use fixed coordinates as default, OCR as fallback
- Consider cloud OCR API for better accuracy (privacy tradeoff)
