# MIAO Motion / 喵动

免费开源、本地优先、面向零基础用户的 VRM 动漫角色实时动捕与 OBS 直播工具。

> 当前代码：v0.2.2 beta。普通摄像头可以实时驱动 VRM 的头部、眨眼、眼神、嘴型和微笑；正式稳定版仍待真实设备验证。

## 已经能做什么

- 拖放或选择本地 VRM 0.x / 1.0 模型。
- 使用 MediaPipe Face Landmarker 实时识别人脸。
- 驱动头部俯仰/转向/侧倾、左右眨眼、眼神、张嘴和微笑。
- 一键校准当前正面姿态，动作使用帧率无关平滑。
- 选择摄像头、查看追踪质量，并调节动作幅度与平滑强度；按 `R` 重新居中。
- 首次启动四步新手引导；没有模型时可直接查看 VRoid Studio 制作方法。
- 自动检查完整 Humanoid 必需骨骼、作者/许可声明、表情、视线、三角面、材质、贴图和估算显存，并给出修复方向。
- 性能优先、均衡、清晰优先三档画质，可导入/导出设置。
- 多角色库支持切换、重命名、删除、最近恢复和缩略图；命名配置档可绑定角色、取景、背景、画质、动作与输出比例。
- 可运行开播前自检，查看/清除跨刷新保留的脱敏日志，并下载不含画面、模型内容、文件路径和设备编号的诊断报告。
- 影棚、绿幕、透明三种背景。
- 保存多个模型到当前浏览器；不同浏览器、端口或 OBS 内置浏览器不共享存储。
- 提供无界面直播模式及 OBS 浏览器源地址。
- 摄像头画面与模型不上传服务器。

## Windows 小白启动方法

### 推荐：免 Node.js 便携包

1. 在 [测试版发布页](https://github.com/bocmiao/MIAO-Motion/releases) 下载最新 beta 的 `MIAO-Motion-portable.zip` 与同名 `.sha256`，右键“全部解压缩”。
2. 双击 `双击启动喵动.bat`。不要直接在压缩包预览窗口中运行。
3. 浏览器打开后，选择 VRM、开启摄像头，再做正面校准。

便携包含预构建网页、离线资源、许可证和本机服务器，无需 Node.js；同页提供 Windows 安装包。beta 不代表真实相机/直播软件已验证。国内镜像需所有者配置，当前未启用。详见 [中文下载与校验说明](public/download.html)。

### 源码版

1. 安装 [Node.js 22 LTS 或更新版本](https://nodejs.org/zh-cn)。
2. 下载并解压本仓库。
3. 双击 `start-windows.bat`。
4. 浏览器打开后，点击“选择 VRM”，再点击“开启摄像头”。
5. 正对摄像头点击“正面校准”。

第一次执行构建需要联网准备依赖和 Face Landmarker 模型。下载困难时可先执行 `npm config set registry https://registry.npmmirror.com`；也可用 `MIAO_FACE_MODEL_URL` 指定镜像 URL，或用 `MIAO_FACE_MODEL_PATH` 指定已下载文件。文件仍必须通过固定 SHA-256 校验。生成的运行包启动和推理无需联网。

完整图文步骤、常见错误和 OBS 后备方案见 [零基础使用教程](docs/BEGINNER_GUIDE.md)。

## 开发者启动方法

需要 Node.js 22 或更高版本：

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

### 进阶实验：OBS 浏览器来源

OBS 内置浏览器不与 Chrome/Edge 共享 IndexedDB，通常也不会弹出摄像头授权。需要用 `--enable-media-stream` 参数启动 OBS，在 OBS“交互”窗口内重新选择 VRM；不要让普通页面与 OBS 页面同时占用摄像头。

地址格式：

```text
http://127.0.0.1:4173/?broadcast=1&background=transparent
```

广播页在缺少模型、摄像头或发生错误时会显示中文状态浮层；正常工作后自动隐藏。

## 当前边界与验收状态

- 当前只做脸部和头部动捕，身体、手部和音频口型留到后续版本。
- 无模型可一键使用随包的 pixiv 技术示例（[独立许可](public/example-license.html)）；自己的角色需确认合法使用权。
- 源码第一次构建需要联网准备 MediaPipe 模型；构建完成后，摄像头帧、模型和推理均留在本机。
- OBS 对摄像头权限的处理随系统和 OBS 版本不同，绿幕窗口捕获是可靠后备方案。
- 当前没有可用 Windows 真机；Tauri 2 桌面壳、安装包工作流和浏览器便携包均已进入代码库，但不能把自动构建等同于真实安装/摄像头/OBS 通过。证据状态见 [验证状态](docs/VALIDATION_STATUS.md)。

## 项目计划

- [Claude 第二轮整改记录](docs/CLAUDE_ROUND2_REMEDIATION.md)：17 项缺陷/交付对照，实际测试证据和明确未完成项。

- [计划—代码差距审计与执行清单](docs/PLAN_CODE_GAP_AUDIT_2026-09-28.md)：逐项对照全部计划、当前实现、可独立完成工作和真人验证事项。
- [完整项目计划书](docs/PROJECT_PLAN.md)：产品定位、竞品、开源复用、功能范围、架构、路线图、风险与发布策略。
- [设备与使用记录清单](docs/ACCEPTANCE.md)：记录实际验证结果，不作为其他代码工作的前置门槛。
- [当前验证状态](docs/VALIDATION_STATUS.md)：已自动验证、代码审查覆盖和必须等待真机的项目。
- [商标与项目资产政策](TRADEMARKS.md)：区分开源代码权利、官方名称/Logo 与用户模型授权。
- [项目现状审计](docs/PROJECT_STATUS.md)：已经完成、部分完成、尚未完成和后续优化优先级。
- [零基础使用教程](docs/BEGINNER_GUIDE.md)：从安装 Node.js、制作 VRM 到接入 OBS。
- [直播与会议软件接入](docs/LIVE_PLATFORM_GUIDE.md)：OBS、直播姬/直播伴侣和腾讯会议通用接入。
- [Tauri 2 桌面版构建](docs/DESKTOP_BUILD.md)：从零安装工具链、开发运行、生成 Windows NSIS 安装包及当前边界。
- [Claude 审计整改对照](docs/CLAUDE_AUDIT_REMEDIATION.md)：P0–P3 每项结果、证据和待人工验收项。
- [版本记录](CHANGELOG.md)：候选版本新增、改进和待验证内容。
- [技术架构](docs/architecture.md)：当前代码链路与模块边界。
- [贡献指南](CONTRIBUTING.md)：开发流程、范围与许可证要求。

## 开源协议

源代码使用 [Mozilla Public License 2.0](LICENSE)。角色、模型、字体和其他美术资产不自动继承代码协议，必须单独确认授权，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 隐私与安全

- 不需要账号，不包含遥测。
- 模型保存在当前浏览器的 IndexedDB 中。
- 摄像头帧仅交给当前设备上的 MediaPipe 推理。
- 导出的设置文件不含模型、摄像头编号或画面；诊断报告不含模型内容和本机路径。
- 建议只通过 `127.0.0.1` 启动，不要暴露到公网。
