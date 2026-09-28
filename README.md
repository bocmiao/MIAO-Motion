# MIAO Motion / 喵动

免费开源、本地优先、面向零基础用户的 VRM 动漫角色实时动捕与 OBS 直播工具。

> 当前代码：v0.2.1 候选版。普通摄像头可以实时驱动 VRM 的头部、眨眼、眼神、嘴型和微笑；正式发布仍等待 Windows 真机验收。

## 已经能做什么

- 拖放或选择本地 VRM 0.x / 1.0 模型。
- 使用 MediaPipe Face Landmarker 实时识别人脸。
- 驱动头部俯仰/转向/侧倾、左右眨眼、眼神、张嘴和微笑。
- 一键校准当前正面姿态，动作使用帧率无关平滑。
- 选择摄像头、查看追踪质量，并调节 50%–150% 动作幅度。
- 首次启动四步新手引导；没有模型时可直接查看 VRoid Studio 制作方法。
- 自动检查模型的头部、眨眼、嘴型、视线、三角面、材质、贴图和估算显存，并区分提醒与阻断。
- 性能优先、均衡、清晰优先三档画质，可导入/导出设置。
- 可删除浏览器中的模型副本，并下载不含画面、模型内容、文件路径和设备编号的诊断报告。
- 影棚、绿幕、透明三种背景。
- 保存最后导入的模型到当前浏览器；不同浏览器、端口或 OBS 内置浏览器不共享存储。
- 提供无界面直播模式及 OBS 浏览器源地址。
- 摄像头画面与模型不上传服务器。

## Windows 小白启动方法

### 推荐：免 Node.js 便携包

1. 在 GitHub Actions 的成功构建中下载 `MIAO-Motion-portable-windows`，并解压 ZIP。
2. 双击 `start-portable.bat`。不要直接在压缩包预览窗口中运行。
3. 浏览器打开后，选择 VRM、开启摄像头，再做正面校准。

便携包包含预构建网页、离线动捕资源、许可证和本地 PowerShell 服务器，不需要安装 Node.js。正式 Release 和国内镜像仍要等真机验收。

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

- v0.2.1 只做脸部和头部动捕，身体、手部和音频口型留到后续版本。
- 用户需要自行准备有合法使用权的 VRM 模型。
- 源码第一次构建需要联网准备 MediaPipe 模型；构建完成后，摄像头帧、模型和推理均留在本机。
- OBS 对摄像头权限的处理随系统和 OBS 版本不同，绿幕窗口捕获是可靠后备方案。
- 当前没有可用 Windows 真机，已经完成的自动化验证与待办项见 [验证状态](docs/VALIDATION_STATUS.md)。未通过真机门槛前不会标记 v0.2.1 正式发布。

## 项目计划

- [计划—代码差距审计与执行清单](docs/PLAN_CODE_GAP_AUDIT_2026-09-28.md)：逐项对照全部计划、当前实现、可独立完成工作和真人验证事项。
- [完整项目计划书](docs/PROJECT_PLAN.md)：产品定位、竞品、开源复用、功能范围、架构、路线图、风险与发布策略。
- [版本验收清单](docs/ACCEPTANCE.md)：从 v0.2.1 实机验证到 v1.0 发布的逐项门槛。
- [当前验证状态](docs/VALIDATION_STATUS.md)：已自动验证、代码审查覆盖和必须等待真机的项目。
- [项目现状审计](docs/PROJECT_STATUS.md)：已经完成、部分完成、尚未完成和后续优化优先级。
- [零基础使用教程](docs/BEGINNER_GUIDE.md)：从安装 Node.js、制作 VRM 到接入 OBS。
- [直播与会议软件接入](docs/LIVE_PLATFORM_GUIDE.md)：OBS、直播姬/直播伴侣和腾讯会议通用接入。
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
