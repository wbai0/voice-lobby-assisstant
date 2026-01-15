# Tesseract for macOS

## 方法 1: 使用 Homebrew (开发时)

如果系统已安装 Homebrew 版本的 tesseract，代码会自动使用它:

```bash
brew install tesseract
brew install tesseract-lang  # 包含中文支持
```

## 方法 2: 打包独立二进制 (发布时)

1. 安装 tesseract:

   ```bash
   brew install tesseract tesseract-lang
   ```

2. 复制二进制和依赖:

   ```bash
   # 复制 tesseract 二进制
   cp $(brew --prefix)/bin/tesseract ./tesseract

   # 复制 tessdata
   cp -r $(brew --prefix)/share/tessdata ./tessdata
   ```

3. 处理动态库依赖 (可选，如果需要完全独立):

   ```bash
   # 查看依赖
   otool -L ./tesseract

   # 使用 dylibbundler 或手动复制依赖
   ```

## 目录结构

```
tesseract-macos/
├── tesseract
└── tessdata/
    ├── chi_sim.traineddata
    └── eng.traineddata
```

## 注意

- macOS 版本可以依赖系统安装的 Homebrew tesseract
- 如果要打包独立版本，需要处理动态库依赖
