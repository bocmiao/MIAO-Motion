# 当前验证状态

更新：2026-09-29，v0.3.0 第三轮整改。当前功能范围见 [整改对照](ROUND3_REMEDIATION.md)。

## 已发布的最终版本

**[main CI 36458062086](https://github.com/bocmiao/MIAO-Motion/actions/runs/36458062086) 五项全部成功**：build、browser-smoke、windows-portable、windows-desktop、publish-beta。发布源码为 `58b1c0a8ef62e6467b3e9ba1d4279948cd797d9b`，37 项 Node、25 条浏览器流程通过；浏览器 25 条一次通过，没有重试。

[v0.3.0-beta](https://github.com/bocmiao/MIAO-Motion/releases/tag/v0.3.0-beta) 已公开发布（非草稿、预发布），包含安装包、便携 ZIP 及各自校验文件。已从公开 Release 下载两份完整产物，重新计算 SHA-256，与同名校验文件和 GitHub digest 一致：

| 文件 | 字节数 | 实际下载 SHA-256 |
|---|---:|---|
| MIAO-Motion-portable.zip | 29,324,617 | `510b023a9de199993073da52c501709bc4456a16b6841f087264a4807c8eb1e5` |
| MIAO.Motion_0.3.0_x64-setup.exe | 29,622,102 | `95ce8163c6eed895cc98ccf20c09342e26a233f235ca69678171eb993d1e1d87` |

公开 ZIP 内已核对原创 VRM、Pose/Hand 离线模型、教程截图和许可证。以上校验值是本次验收的历史证据；下载页继续动态选择公开附件，不依赖此表手动更新。最后的文档补录不改变发布源代码。
\n## 实际执行的自动检查

| 范围 | 方法与结果 |
|---|---|
| Node / 类型 / 构建 | 37 项 Node 通过，TypeScript 与 Vite 通过；运行时依赖审计通过 |
| 浏览器 | Windows Chromium / SwiftShader，25 条通过；并发限定 2，防止软件渲染相互抢占 |
| 首帧与取景 | 人为延迟 GPU fence 验证准备提示/按钮；pixiv 真实模型离线导入后等待画面像素；VRM 0/1 三个取景、绿幕与透明像素断言 |
| 原创猫咪 | 生成 VRM、真实导入、兼容性 4/4、换色和表情；真实应用截图随离线教程打包 |
| 本地输入 | 伪麦克风 track 停止、材质保存/恢复；真实 Pose/Hand 引擎在阻断外网条件下启动并释放 |
| 外部协议边界 | 模拟 OBS v5 认证、场景/来源/滤镜/画布请求；模拟 Tauri 二进制帧和手机数据输入，不等同于真实 OBS / 手机 |
| Windows 原生输出 | 编译 DLL、注册独立摄像头、FFmpeg DirectShow 实际接收一帧，验证 640×360、四象限颜色与上下方向，再注销 |
| Windows 便携版 | 普通用户在中文空格目录解压启动；离线资源、非法路径、断流恢复、重复启动与打包 |
| Windows 安装版 | Rust/Tauri 锁定构建；NSIS 安装、窗口启动、无控制台、卸载 |

## CI 证据

**最终候选 [CI 36456210789](https://github.com/bocmiao/MIAO-Motion/actions/runs/36456210789) 全部通过**，提交 `6450b8d`：
build、browser-smoke（24 条）、windows-portable、windows-desktop（原生收帧、NSIS 安装/启动/卸载）成功。验证分支按设计跳过发布任务。已下载该次便携产物，SHA-256 与随包文件一致；实际检查包含原创 VRM、Pose/Hand 模型、新教程、截图和第三方许可证。
随后 main 增加保存失败时的换色记录隔离及第 25 条回归测试，并将原创猫咪测试改为等待首帧完成，解决慢速软件渲染下默认 5 秒等待过短的问题。最终 main 发布构建独立执行并通过全部检查。

### 整改过程中的失败与修复


[验证运行 36454617538](https://github.com/bocmiao/MIAO-Motion/actions/runs/36454617538)，提交 `50ab368`：
build、windows-portable、windows-desktop 成功，包含实际 DirectShow 收帧。浏览器 23/24 成功；失败原因是新增测试只模拟旧版 Tauri 标识、没有设置当前 API 的 `isTauri` 标识，导致测试中的原生按钮禁用。已修复模拟并在本地通过全部 24 条，未删除或放宽断言。此前原生脚本编码和 GUI 进程退出码问题也已修复。

最终版本还需以 main 最新 CI 和对应 Release 为准；验证分支不会发布版本。下载页不再保存随版本过期的校验值，校验文件随 Release 提供。

## 不应从自动检查推导的结论

- 身体/手指引擎初始化成功不等同于真实人体追踪准确；单目遮挡与深度估计存在限制。
- 手机页面测试不等同于 iPhone 真机、路由器、防火墙链路已验证。
- DirectShow 实际收帧证明原生组件能输出；没有证明每个会议软件、32 位/UWP 接收端都兼容。当前仅承诺 64 位 DirectShow 接口，640×360、最多 15 FPS。
- 浏览器测试与 Windows 安装窗口检查不能替代物理摄像头、隐私灯、普通用户桌面、OBS/直播姬/会议软件和长时间运行验收。
- 换色不等同于完整换装；程序化原创示例不等同于精修品牌美术。

## 外部资源与发布定位

用户确认暂无镜像、签名证书与社区账号，本轮提供 [接入说明](DISTRIBUTION_SETUP.md)，不伪造已配置状态。真实设备、新手试用和真人录屏仍待安排，见 [验收清单](ACCEPTANCE.md)。可发布标明限制的 beta，尚不标记为正式稳定版。

## 历史基线

[CI #44](https://github.com/bocmiao/MIAO-Motion/actions/runs/36421921559) 对 v0.2.2-beta 曾通过 36 项 Node、17 条浏览器及 Windows 构建/发布。旧版本独立保留；本轮新增功能不能引用旧版本通过结果替代验证。
