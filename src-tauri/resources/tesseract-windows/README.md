# Tesseract for Windows

## 下载步骤

1. 访问 https://github.com/UB-Mannheim/tesseract/wiki
2. 下载 `tesseract-ocr-w64-setup-5.5.0.20241111.exe` (64 位)
3. 安装到临时目录（如 `C:\tesseract-temp`）
4. 安装时选择 "Additional language data" -> 勾选 "Chinese Simplified"

## 复制文件

安装完成后，从安装目录复制以下文件到此目录：

```
从 C:\tesseract-temp\ 复制:
├── tesseract.exe
├── *.dll (所有 DLL 文件，约 10-15 个)
└── tessdata/
    ├── chi_sim.traineddata
    └── eng.traineddata
```

## 需要的 DLL 文件（参考）

通常需要这些 DLL：

- archive.dll
- bz2.dll
- gif.dll
- jpeg62.dll
- leptonica-1.\*.dll
- libcrypto-\*.dll
- libcurl-\*.dll
- liblzma.dll
- libpng16.dll
- libssl-\*.dll
- lz4.dll
- tesseract\*.dll
- tiff.dll
- turbojpeg.dll
- webp.dll
- zlib1.dll
- zstd.dll

## 最终目录结构

```
tesseract-windows/
├── tesseract.exe
├── *.dll
├── tessdata/
│   ├── chi_sim.traineddata (~40MB)
│   └── eng.traineddata (~4MB)
└── README.md
```

## 验证

在 PowerShell 中运行：

```powershell
.\tesseract.exe --version
```

应该显示版本信息。

## 清理

复制完成后可以卸载临时安装的 Tesseract。
