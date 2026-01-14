# Pico Live Assistant

新人榜自动发消息助手 - 帮助主播自动向新人榜用户发送消息。

## 功能

- 连接 Android 模拟器 (MuMu, 雷电等)
- 自动导航到新人榜页面
- 批量发送文字消息和图片
- OCR 检测当前页面状态（内置 Tesseract）
- 自动更新

## 安装

### Windows

1. 从 [Releases](https://github.com/wbai0/voice-lobby-assisstant/releases) 下载最新的 `.msi` 安装包
2. 运行安装程序
3. ADB 和 OCR 已内置，无需额外安装

### macOS

1. 从 [Releases](https://github.com/wbai0/voice-lobby-assisstant/releases) 下载最新的 `.dmg` 文件
2. 拖拽到 Applications 文件夹
3. ADB 和 OCR 已内置，无需额外安装

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
- OCR: Tesseract (通过 tesseract-rs 静态链接)
- ADB: 内置 Android Debug Bridge

## License

MIT
