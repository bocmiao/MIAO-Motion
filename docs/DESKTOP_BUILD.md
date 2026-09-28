# Tauri 2 桌面版构建说明

仓库已经包含 `src-tauri/` 桌面壳。它复用同一套本地网页资源，不开放 Shell、任意文件系统或第三方网络插件命令；窗口使用透明 WebView，为后续原生透明直播画面保留能力。

## 小白只想使用

优先从 GitHub Actions 的 `MIAO-Motion-Tauri-Windows` 构建产物下载 `*-setup.exe`。当前安装包尚未代码签名，Windows 可能显示未知发布者；正式发布前必须取得证书并完成真机验证。

## 开发者从零构建

1. 安装 Node.js 22 LTS、Rust stable、Microsoft C++ Build Tools 的“使用 C++ 的桌面开发”。
2. Windows 10 1803 以后通常已有 WebView2；若缺少，从微软安装 Evergreen Runtime。
3. 在仓库目录运行 `npm ci`。
4. 开发调试运行 `npm run desktop:dev`。
5. 生成 NSIS 安装包运行 `npm run desktop:build`。

安装包位于 `src-tauri/target/release/bundle/nsis/`。前端仍会在构建前执行离线资源准备、测试和生产构建。

## 当前边界

- CI 能证明 Rust/Tauri 代码可编译并产出 NSIS 文件，不能替代 Windows 10/11 双击、摄像头授权、安装/卸载/升级和 OBS 捕获测试。
- `webviewInstallMode` 使用静默下载引导器；完全断网的干净机器若没有 WebView2，安装后仍可能无法启动。后续可提供带离线 WebView2 的更大安装包。
- 目前没有签名证书和自动更新密钥。发布工作流只创建草稿 Release，不会把未经人工复核的构建自动标为正式版。
- 透明 WebView 已配置，但“OBS 原生透明捕获可靠”仍需真机确认；默认教程继续推荐绿幕窗口捕获。
