# MIAO Motion / 喵动

免费开源、本地优先、面向零基础用户的 VRM 动漫角色实时动捕与 OBS 直播工具。

> 当前版本：v0.3.2-beta（等待本轮 CI 发布）（测试版）。正式稳定版仍待真实设备验证。更新内容见 [v0.3.2-beta 发布说明](docs/BETA_RELEASE_NOTES.md)。
>
> **安全提醒**：v0.3.0-beta 及更早版本的虚拟摄像头组件存在安全隐患，请升级到 v0.3.1-beta 或更新版本。装过组件的用户，升级前请先在旧版“原生虚拟摄像头（Windows）”里点“卸载摄像头组件”；已直接卸载旧版而残留“MIAO Motion Camera”的，安装新版后在同一位置点“卸载摄像头组件”清理。

## 已经能做什么

- 拖放或选择本地 VRM 0.x / 1.0 模型。
- 使用 MediaPipe Face Landmarker 实时识别人脸；“镜像动作”默认像照镜子（你举左手、闭左眼，角色在你看来的左侧动），可关闭改为角色自身同侧。
- 驱动头部俯仰/转向/侧倾、左右眨眼、眼神、张嘴和微笑。
- 一键校准当前正面姿态，动作使用帧率无关平滑。
- 选择摄像头、查看追踪质量，并调节动作幅度与平滑强度；按 `R` 重新居中。
- 首次启动四步新手引导；没有模型时可直接查看 VRoid Studio 制作方法。
- 自动检查完整 Humanoid 必需骨骼、作者/许可声明、表情、视线、三角面、材质、贴图和估算显存，并给出修复方向。
- 性能优先、均衡、清晰优先和自动画质，可导入/导出设置。
- 内置原创猫咪“喵小动”和 pixiv 技术示例；新版喵小动可换耳朵、尾巴、发型、衣服，起名并导出 VRM。材质换色按角色保存，0–5 表情快捷键，麦克风音量驱动嘴型。
- Windows 安装版提供实验性原生虚拟摄像头“MIAO Motion Camera”（64 位 DirectShow，640×360 / 最多 15 FPS，无透明背景），以及指定局域网 iPhone/iPad 的 iFacialMocap 面捕（需要付费 iOS App 和带 Face ID 的设备）。便携版没有这两项，可用窗口捕获或 OBS 中转。
- 可选离线身体/手部追踪（后台运行，不卡画面）、OBS WebSocket 一键创建“喵动 · 绿幕角色”场景（失败自动回滚）、手动检查新版本。详细步骤和限制见 [扩展功能图文教程](public/new-features.html)。
- 多角色库支持切换、重命名、删除、最近恢复和缩略图；命名配置档可绑定角色、取景、背景、画质、动作与输出比例。
- 可运行开播前自检，查看/清除跨刷新保留的脱敏日志，并下载不含画面、模型内容、文件路径和设备编号的诊断报告。
- 影棚、绿幕、透明三种背景。
- 保存多个模型到当前浏览器；不同浏览器、端口或 OBS 内置浏览器不共享存储。
- 提供无界面直播模式及 OBS 浏览器源地址。
- 摄像头画面与模型不上传服务器。

## Windows 小白启动方法

不知道下载哪个？**选安装版**。发布页 Assets 里只需要下载一个文件；`.sha256` 是校验文件，`Source code` 是源代码、不是程序，都不用下载。

### 推荐：安装版

1. 在 [测试版发布页](https://github.com/bocmiao/MIAO-Motion/releases) 的最新 beta 下，下载 `MIAO.Motion_<版本>_x64-setup.exe`。
2. 双击按提示安装，之后从开始菜单打开“MIAO Motion”。
3. 点“用喵小动”或导入自己的 VRM，开启摄像头，再做正面校准。

安装版功能最全，包括原生虚拟摄像头和手机面捕（实验），不需要 Node.js。

### 电脑不能装软件时：免安装便携包

1. 在同一发布页下载 `MIAO-Motion-portable.zip`，右键“全部解压缩”。
2. 双击 `双击启动喵动.bat`。不要直接在压缩包预览窗口中运行。
3. 浏览器打开后，选择 VRM、开启摄像头，再做正面校准。

便携包含预构建网页、离线资源、许可证和本机服务器，无需 Node.js，但没有原生虚拟摄像头和手机面捕。beta 不代表真实相机/直播软件已验证。国内镜像需所有者配置，当前未启用。详见 [中文下载与校验说明](public/download.html)。

### 源码版

1. 安装 [Node.js 22.18 或更新版本](https://nodejs.org/zh-cn)。
2. 下载并解压本仓库。
3. 双击 `start-windows.bat`。
4. 浏览器打开后，点击“选择 VRM”，再点击“开启摄像头”。
5. 正对摄像头点击“正面校准”。

第一次执行构建需要联网准备依赖和 Face Landmarker 模型。下载困难时可先执行 `npm config set registry https://registry.npmmirror.com`；也可用 `MIAO_FACE_MODEL_URL` 指定镜像 URL，或用 `MIAO_FACE_MODEL_PATH` 指定已下载文件。文件仍必须通过固定 SHA-256 校验。生成的运行包启动和推理无需联网。

完整图文步骤、常见错误和 OBS 后备方案见 [零基础使用教程](docs/BEGINNER_GUIDE.md)。

## 开发者启动方法

需要 Node.js 22.18 或更高版本：

```bash
npm install
npm run dev
```

生产方式：

```bash
npm run build
npm run start
```

测试：

```bash
npm test
npm run typecheck
npm run test:e2e
```

桌面开发与 Windows NSIS 构建分别运行 `npm run desktop:dev` 和 `npm run desktop:build`，所需 Rust/Build Tools 见 [桌面版构建说明](docs/DESKTOP_BUILD.md)。

## OBS 使用

### 推荐：绿幕窗口捕获

1. 在普通页面导入模型并开启摄像头。
2. 把背景切换为“绿幕”，再点击“进入直播画面”。
3. OBS → 来源 → 添加“窗口捕获”，选择 MIAO Motion 窗口。
4. 给来源添加“色度键”滤镜并选择绿色。
5. 不要最小化或完全遮挡 MIAO Motion 窗口，避免 Chromium 后台节流使动作冻结。

也可以在喵动展开“自动配置 OBS（Windows）”，填入 OBS WebSocket 密码一键创建场景。直播伴侣、视频号、小红书、虎牙、斗鱼和会议软件的接入方法（含原生虚拟摄像头与竖屏 1080×1920 设置）见 [直播与会议软件接入指南](docs/LIVE_PLATFORM_GUIDE.md)。

### 进阶实验：OBS 浏览器来源

OBS 内置浏览器不与 Chrome/Edge 共享 IndexedDB，通常也不会弹出摄像头授权。需要用 `--enable-media-stream` 参数启动 OBS，在 OBS“交互”窗口内重新选择 VRM；不要让普通页面与 OBS 页面同时占用摄像头。

地址格式：

```text
http://127.0.0.1:4173/?broadcast=1&background=transparent
```

广播页在缺少模型、摄像头或发生错误时会显示中文状态浮层；正常工作后自动隐藏。

## 当前边界与验收状态

- 身体/手部是低频实验追踪。捏人：新版喵小动可换耳朵、尾巴、发型、衣服，起名、换色并导出 VRM（作者仍为喵动项目，VRM 公共许可）；其他 VRM 只能换色。更新提醒需主动点击，不自动下载安装。
- 无模型可一键使用原创猫咪（[资产许可](public/miao-license.html)）或 pixiv 技术示例（[独立许可](public/example-license.html)）；自己的角色需确认合法使用权。
- 源码第一次构建需要联网准备 MediaPipe 模型；构建完成后，摄像头帧、模型和推理均留在本机。
- OBS 对摄像头权限的处理随系统和 OBS 版本不同，绿幕窗口捕获是可靠后备方案。
- 已有 Windows 自动构建、安装/启动/卸载和 DirectShow 实际收帧验证；物理摄像头、手机、OBS/会议软件及普通用户完整体验仍待验证。证据状态见 [验证状态](docs/VALIDATION_STATUS.md)。

## 项目计划

- [项目现状](docs/PROJECT_STATUS.md)：最新的已完成、部分完成、尚未完成和后续优化优先级。
- [第四轮整改记录](docs/ROUND4_REMEDIATION.md)、[第三轮整改记录](docs/ROUND3_REMEDIATION.md)：历次审计的实现、验证与真实边界。
- [镜像、签名与社区接入说明](docs/DISTRIBUTION_SETUP.md)：暂无外部资源，按用户要求先完成代码与接入说明。

- [Claude 第二轮整改记录](docs/CLAUDE_ROUND2_REMEDIATION.md)：17 项缺陷/交付对照，实际测试证据和明确未完成项。

- [计划—代码差距审计与执行清单](docs/PLAN_CODE_GAP_AUDIT_2026-09-28.md)：逐项对照全部计划、当前实现、可独立完成工作和真人验证事项。
- [完整项目计划书](docs/PROJECT_PLAN.md)：产品定位、竞品、开源复用、功能范围、架构、路线图、风险与发布策略。
- [设备与使用记录清单](docs/ACCEPTANCE.md)：记录实际验证结果，不作为其他代码工作的前置门槛。
- [当前验证状态](docs/VALIDATION_STATUS.md)：已自动验证、代码审查覆盖和必须等待真机的项目。
- [商标与项目资产政策](TRADEMARKS.md)：区分开源代码权利、官方名称/Logo 与用户模型授权。
- [零基础使用教程](docs/BEGINNER_GUIDE.md)：从下载、准备角色、手机面捕到接入直播平台。
- [直播与会议软件接入](docs/LIVE_PLATFORM_GUIDE.md)：窗口捕获、原生虚拟摄像头和 OBS 推流码三条路线；OBS、B站直播姬、抖音/快手直播伴侣、视频号、小红书、虎牙、斗鱼及腾讯会议等会议软件。
- [Tauri 2 桌面版构建](docs/DESKTOP_BUILD.md)：从零安装工具链、开发运行、生成 Windows NSIS 安装包及当前边界。
- [Claude 审计整改对照](docs/CLAUDE_AUDIT_REMEDIATION.md)：P0–P3 每项结果、证据和待人工验收项。
- [版本记录](CHANGELOG.md)：各版本的发布日期、新增与修复。
- [技术架构](docs/architecture.md)：当前代码链路与模块边界。
- [贡献指南](CONTRIBUTING.md)：开发流程、范围与许可证要求。

## 开源协议

源代码使用 [Mozilla Public License 2.0](LICENSE)。角色、模型、字体和其他美术资产不自动继承代码协议，必须单独确认授权，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 隐私与安全

- 不需要账号，不包含遥测。
- 模型保存在当前浏览器的 IndexedDB 中。
- 摄像头帧仅交给当前设备上的 MediaPipe 推理。
- 语音只在本机分析音量；手机面捕只接收指定局域网设备的动作参数。OBS 密码不保存。下载页和主动检查更新会访问 GitHub。
- 导出的设置文件不含模型、摄像头编号或画面；诊断报告不含模型内容和本机路径。
- 建议只通过 `127.0.0.1` 启动，不要暴露到公网。
