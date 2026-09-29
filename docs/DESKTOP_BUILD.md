# Tauri 2 桌面版构建说明

仓库已经包含 `src-tauri/` 桌面壳。它复用同一套本地网页资源，不开放 Shell、任意文件系统或第三方网络插件命令；窗口使用透明 WebView，为后续原生透明直播画面保留能力。

## 小白只想使用

从 [beta 发布页](https://github.com/bocmiao/MIAO-Motion/releases) 下载 `*-setup.exe` 和同名 SHA-256。安装包尚未签名，可能被系统阻止或显示未知发布者；不要关闭安全策略。beta 不代表真实摄像头/直播软件已验证，正式稳定版还未发布。

## 开发者从零构建

1. 安装 Node.js 22.18 或更新版本、Rust stable、Microsoft C++ Build Tools 的“使用 C++ 的桌面开发”（含 Windows SDK、CMake）。
2. Windows 10 1803 以后通常已有 WebView2；若缺少，从微软安装 Evergreen Runtime。
3. 在仓库目录运行 `npm ci`。
4. 开发调试运行 `npm run desktop:dev`。
5. 先运行 `npm run build` 做全量自动检查，再运行 `npm run desktop:build -- -- --locked` 生成 NSIS 安装包（两个 `--` 分别透传 npm 和 Tauri，最后的参数属于 Cargo）。

安装包位于 `src-tauri/target/release/bundle/nsis/`。桌面命令构建前执行离线资源准备和网页构建，不自动重复 Node 测试；CI 的 build job 独立执行全部 Node/类型检查。

版本以 `package.json` 为准：`npm version` 自动同步 Cargo manifest/lock，Tauri 读取 package 路径，网页由 Vite 注入。`tests/version.test.mjs` 防止手工更新漏项。两份 Cargo.lock 都需提交，CI 使用 --locked。

## 当前边界

- 桌面构建会先编译 `native/` 下的 DirectShow DLL 和中文注册程序，并将它们随包分发。只有用户点击安装组件后才请求 UAC 注册；卸载应用前先在应用中卸载组件。支持范围见 [原生组件说明](../native/README.md)。
- 签名证书、镜像和社区地址尚未提供，接入方式见 [分发接入说明](DISTRIBUTION_SETUP.md)。

- CI 现会静默安装、启动并检查窗口、卸载，且验证没有控制台子系统；运行结果见 VALIDATION_STATUS。它不能替代用户桌面、相机/OBS 和升级体验。
- `webviewInstallMode` 使用静默下载引导器；完全断网的干净机器若没有 WebView2，安装后仍可能无法启动。后续可提供带离线 WebView2 的更大安装包。
- 目前没有签名证书和自动更新密钥。CI 可自动发布明确标识的 beta，已有同版本不覆盖；稳定 Tag 在 release.yml 中保持草稿，不自动冒充正式稳定版。
- 透明 WebView 已配置，但“OBS 原生透明捕获可靠”仍需真机确认；默认教程继续推荐绿幕窗口捕获。
