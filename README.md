# Sound Island · 声音小岛

离线优先的手机音频工作台。视频只在设备中处理，不上传服务器，无账号、无 API、无 CDN。

## 功能

- 手机相册/文件选择及桌面拖放，FFmpeg WebAssembly 提取音轨。
- 波形、秒数/滑块剪切、原始选区试听与停止。
- 音量、淡入淡出、倒放；MP3 192 kbps / WAV PCM 导出、下载和系统分享。
- 耗时阶段提示、进度、已用时间、取消、3 分钟超时保护、错误恢复。
- PWA 安装，完整应用和约 32 MB 单线程引擎预缓存，明确显示离线就绪状态及失败重试。

## 运行

Node.js 22+。

```sh
npm ci
npm test
npm run build
```

开发：`npm run dev`（仅开发界面；完整 Service Worker 在生产构建生成）。
生产：将 `dist/` 放到 HTTPS 静态服务器，或使用 localhost。支持子目录部署，例如 `/sound-island/`；无需跨源隔离头。不要直接双击 HTML，也不要通过手机的 HTTP 局域网地址验收 PWA。

## GitHub Pages

目标仓库：`pwa-world/sound-island`。

1. 创建空仓库并推送本项目至 `main`。
2. 在仓库 Settings → Pages → Build and deployment 选择 **GitHub Actions**。
3. `.github/workflows/pages.yml` 会安装锁定依赖、测试、构建并部署。
4. 成功部署后通常访问 `https://pwa-world.github.io/sound-island/`；此地址仅为预期地址，不代表已经部署。

## 离线使用

首次在 HTTPS 下打开，等待“离线资源已就绪”，再断网。可安装到主屏幕，也可在浏览器中使用。应用尝试申请持久存储，但系统仍可能清理缓存；清理后需要再次联网准备。所有资源（含 Worker、WASM、图标和样式）均来自本站并预缓存。

源文件和编辑结果仅保存在本次页面的内存中，关闭或刷新不会恢复，请及时导出保存；原始视频不会被修改。iOS 文件保存可通过系统分享 → 存储到文件完成。

## 限制

- 单文件最多 150 MB、音轨最多 10 分钟；移动设备可用内存较少时仍可能失败，请缩短视频。
- 提取使用第一条音轨，转换为 44.1 kHz 双声道 WAV，WAV 导出不会恢复源文件已经损失的音质。
- 无音轨、DRM 或引擎不支持的格式会显示错误。
- 试听为原始选区；编辑效果可在导出结果播放器试听。
- 浏览器/系统弹出的文件选择器、分享和下载由系统控制，应用会显示操作结果或后续指引。

## 验证

`npm test` 包括：剪切边界、淡入淡出裁限，以及实际打包 WASM 引擎生成测试视频、提取音轨、导出 MP3/WAV、检查 WAV 时长与无音轨报错。`npm run build` 生成完整预缓存清单。

交付环境未提供浏览器控制工具，因此以下真机验收尚未完成：

- iOS Safari 与 Android Chrome 导入 MP4/MOV，试听、裁剪、导出和文件保存。
- 首次缓存完成后开启飞行模式，关闭并重开 PWA，重复完整操作。
- 首次资源下载中断、重试、处理中取消后重试、短片段淡入淡出、无音轨、大文件与低内存。

## 授权

项目使用 GPL-3.0-or-later。FFmpeg WebAssembly 核心为 GPL-2.0-or-later，具体依赖和源码链接见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
