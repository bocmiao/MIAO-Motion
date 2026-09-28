# Claude 项目审计整改对照表

> 第一轮历史记录。第二轮发现直播布局、眼神/VRM0 方向和异步完成检查仍有缺陷，因此本页“完成”不代表最终验证。当前请看 [第二轮整改记录](CLAUDE_ROUND2_REMEDIATION.md) 与 [实际验证状态](VALIDATION_STATUS.md)。

> 整改日期：2026-09-28
>
> 审计来源：[`claude审计报告.md`](claude审计报告.md)
>
> 原则：可由代码、测试和文档完成的事项全部实施；必须依赖真实 Windows/摄像头/OBS、外部账号、授权素材或仓库管理员权限的事项不伪报通过。

## 编号问题逐项结果

| 编号 | 结果 | 主要证据 | 仍需外部条件 |
|---|---|---|---|
| P0-1 国内首次构建受阻 | 代码完成 | 模型支持 URL/本地文件镜像、30 秒超时与重试、中文错误、固定 SHA-256；CI 产出无需 Node.js 的 Windows 便携 ZIP 和校验文件；README 提供 npm 镜像说明 | 国内镜像实际账号、上传与长期维护 |
| P0-2 OBS 浏览器源假设错误 | 代码/文档完成 | 绿幕窗口捕获改为推荐；广播页缺模型时可导入并显示错误；文档写明 CEF 独立存储、`--enable-media-stream` 与摄像头争用 | OBS 30/31 真机结论 |
| P1-3 丢脸后头部不回正 | 完成 | 丢脸与关闭摄像头时复制中立四元数；纯函数与运行时契约测试 | — |
| P1-4 骨骼型 LookAt 无效 | 完成 | 统一写入 `lookAt.yaw/pitch`；模型医生区分 bone/expression；角度测试 | VRoid 实模目视验收 |
| P1-5 MToon/morph 漏计 | 完成 | 独立指标模块枚举 MToon getter/uniforms、morphAttributes；合成模型测试 | — |
| P1-6 摄像头启动重入 | 完成 | `cameraStarting` 守卫并同步禁用两个入口；Playwright 冒烟用例 | — |
| P1-7 模型加载竞态 | 完成 | `loadGeneration` 丢弃过期结果并释放场景；加载期禁用入口；运行时契约测试 | — |
| P1-8 BAT 行尾 | 完成 | `.gitattributes` 固定 CRLF；实际脚本为 CRLF；测试拒绝裸 LF | — |
| P2-9 镜像/欧拉校准 | 代码完成 | 单一镜像开关集中处理头部 yaw/roll、左右眨眼与视线；相对四元数校准；单元测试 | 默认开/关需真人确认 |
| P2-10 启动器重复构建 | 完成 | lockfile 哈希决定 `npm ci`；版本标记决定构建；`build:app` 不跑测试；全中文错误；便携包另有无 Node 启动器 | — |
| P2-11 广播无反馈 | 完成 | 缺模型、缺摄像头、加载中和错误均显示中文状态浮层，正常后隐藏 | — |
| P2-12 窗口捕获节流 | 文档完成 | README、离线帮助与平台指南明确禁止最小化/完全遮挡 | Windows Chromium/OBS 实测 |
| P2-13 文档代码矛盾 | 完成 | 头骨缺失说明、OBS 路径、Windows 10 级别和摄像头错误文案统一 | — |
| P2-14 CI 覆盖不足 | 完成 | Linux 构建、MediaPipe/Chromium 缓存、Chromium Playwright、失败证据上传、Windows 构建/CRLF/便携服务器 HTTP 冒烟/便携包 artifact | — |
| P2-15 测试组织/声明漂移 | 完成 | Node 测试拆为 `test()` 粒度；开启 `allowJs/checkJs`；运行时导出与声明一致性测试 | — |
| P2-16 诊断脱敏不足 | 完成 | 覆盖反斜杠/正斜杠 Windows、UNC、WSL、macOS 卷路径；UA 只保留浏览器大版本；单元测试 | — |
| P3-17 `innerHTML` 风险 | 完成 | 诊断列表只用 `createElement`/`textContent`；契约测试禁止赋值 `innerHTML` | — |
| P3-18 缺少 CSP | 完成 | 主页面 CSP 限制连接、脚本、图片、媒体、Worker、对象和表单；E2E 加载验证 | — |
| P3-19 键盘/无障碍 | 完成 | 拖放区 Enter/空格打开文件；meter 有可访问名称；DOM/E2E 测试 | — |
| P3-20 模型保存内存峰值 | 完成 | IndexedDB 直接保存 File/Blob，不再复制 ArrayBuffer | — |
| P3-21 第三方许可 | 完成 | 构建脚本从 lockfile 生成运行时许可汇总；Face Landmarker Apache-2.0 单列；许可进入 `dist/licenses` 和便携包 | — |
| P3-22 安全渠道/DCO | 部分完成 | SECURITY 指向 GitHub 私密安全报告并保留无详情公共兜底；删除未自动执行的 DCO 要求 | 仓库所有者需在 Settings → Security 启用 Private vulnerability reporting |
| P3-23 IndexedDB 无迁移 | 完成并扩展 | schema v3 `models`/`profiles`、元数据、updatedAt、v1→v3 Blob 迁移；多模型、缩略图和配置档；契约/E2E 用例 | 大型真实模型容量待真机 |
| P3-24 首屏包偏大 | 按报告维持 | 暂不为了数字拆分 three-vrm/Three.js；构建继续记录包体警告，桌面版以实测启动数据复评 | Tauri 首屏数据 |
| P3-25 缺少 pagehide | 完成 | `beforeunload` 与 `pagehide` 都释放摄像头；契约测试 | — |

## “小白可用”阶段 0/1 已完成

- 自然放下双臂的休息姿势。
- 无人脸时呼吸与自动眨眼。
- 头像、半身、全身三种取景预设，默认半身。
- 高级设置默认折叠，首屏保留导入、摄像头、直播三个主动作。
- 打包进应用的离线帮助页。
- OBS、国内直播软件、腾讯会议通用接入指南。
- Node-free 便携包流水线与 SHA-256。
- 多模型库、VRM 许可摘要、命名配置档、平滑/输出比例、开播自检和持久脱敏日志。
- Tauri 2 最小权限桌面壳、NSIS Windows CI 和草稿 Release 工作流。
- 项目自产的最小/损坏 VRM 自动化夹具。

## 本次明确未冒充完成的事项

以下不是“不理解”，而是当前环境客观缺少外部条件：

1. Windows 10/11、真实摄像头、GPU、OBS 30/31、窗口遮挡、隐私灯和 60 分钟稳定性验收。
2. 镜像默认方向、自然手臂姿势和 LookAt 在至少 5 个合法真实 VRM 上的目视调参。
3. GitHub 私密漏洞报告开关（需要仓库管理员权限）。
4. 国内下载镜像、B 站视频、QQ群/Gitee 等运营账号的创建和上传。
5. 面向用户的示例角色：仓库内自产最小 VRM 只用于自动化，不是可直播美术角色；仍需原创或明确授权的成品角色。
6. 代码签名、SmartScreen、自动更新、虚拟摄像头、身体/手部、Spout2 和 OBS 自动配置。

## 验证命令

```bash
npm ci
npm run build
npm run test:e2e
npm audit --omit=dev --audit-level=high
```

真机记录继续使用 [`ACCEPTANCE.md`](ACCEPTANCE.md) 的模板；没有设备证据时保持未勾选。
