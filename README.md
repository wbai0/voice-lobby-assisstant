# Pico Live Assistant

新人榜自动发消息助手 - 帮助主播自动向新人榜用户发送消息。

## 功能

- 连接 Android 模拟器 (MuMu, 雷电等)
- 自动导航到新人榜页面
- 批量发送文字消息和图片
- OCR 检测当前页面状态（内置 Tesseract，无需联网下载）
- 自动更新（需要能访问 GitHub）

## 安装

### Windows

1. 从 [Releases](https://github.com/wbai0/pico-releases/releases) 下载最新的 `.msi` 安装包
2. 运行安装程序
3. ADB 和 OCR 训练数据已内置，无需额外安装

### macOS

1. 从 [Releases](https://github.com/wbai0/pico-releases/releases) 下载最新的 `.dmg` 文件
2. 拖拽到 Applications 文件夹
3. 首次打开可能提示"无法验证开发者"，请右键点击 → 打开 → 点击"打开"
4. 或运行: `xattr -cr /Applications/Pico\ Live\ Assistant.app`
5. ADB 和 OCR 训练数据已内置，无需额外安装

### 国内用户注意

- 自动更新功能需要访问 GitHub，国内可能无法使用
- 建议手动从 Releases 页面下载新版本
- 应用本身的所有功能（OCR、ADB 等）均已内置，不需要联网

## 使用方法

1. 启动 Android 模拟器
2. 打开 Pico Live Assistant
3. 选择模拟器并连接
4. 点击 "去新星榜" 导航到新人榜
5. 添加要发送的消息内容
6. 设置发送数量和间隔
7. 点击 "开始发送"

## 开发

### 环境要求

- Node.js 18+
- Rust 1.83+
- pnpm
- CMake (用于编译 Tesseract)

### 本地开发

```bash
cd operations
pnpm install
pnpm tauri dev
```

### 构建

```bash
pnpm tauri build
```

## 技术栈

- 前端: React + TypeScript + Vite
- 后端: Tauri (Rust)
- OCR: Tesseract (通过 tesseract-rs 静态链接，训练数据已打包)
- ADB: 内置 Android Debug Bridge

## License

MIT
