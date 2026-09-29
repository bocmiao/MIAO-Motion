# 喵动 DirectShow 虚拟摄像头

基于 MIT 许可的 [tshino/softcam](https://github.com/tshino/softcam)，固定来源提交 `5113173d22a6aac4c9f30c36bb2cf900afef05f4`。随附 `softcam/LICENSE`，Microsoft DirectShow Base Classes 原版权声明保留。修改：独立 CLSID、独立共享内存名称、喵动设备名称；增加中文注册助手，DLL 作为构建时资源嵌入助手。未使用 UnityCapture 的任何代码。

Windows 安装版的本机画面通过 Tauri 二进制消息发送到组件；固定 640×360、最多 15 FPS，BGR、无 alpha，按比例留边。只有一个帧请求在途，停止/退出释放发送器。接收端须支持 64 位 DirectShow；Windows Camera/UWP、32 位接收端不在这次实现的支持范围。输出组件与 Windows 11 MFVirtualCamera 探针相互独立，Windows 10 也可使用 DirectShow。

```powershell
cmake -S native -B native/build -A x64
cmake --build native/build --config Release
```

这是实验功能。用户主动安装组件时请求 UAC 授权，默认不注册。助手只部署自身嵌入的 DLL 到 Program Files/MIAO Motion Camera，目录和文件仅管理员/System 可写，普通用户只读/执行；不会以管理员权限加载用户目录中的相邻 DLL。等待 UAC 和退出码在后台线程执行。安装流程会改变系统摄像头列表，不会访问实体摄像头或网络。

## 注册、卸载、升级与多用户

组件是整机共享的（HKLM + Program Files），喵动安装版是按用户安装的。为了区分“谁装的组件”，助手在**发起操作的用户**的 HKCU `Software\MIAO Motion\Camera` 下记录：

| 值 | 含义 | 写入者 |
| --- | --- | --- |
| `RegisteredByUser`=1 | 当前 Windows 用户安装了组件 | `camera-register.exe` 注册成功后写入，注销成功后删除 |
| `ReinstallPending`=1 | 当前用户的卸载器注销了组件，下次安装喵动时恢复 | NSIS 卸载钩子写入；安装钩子恢复后删除；助手任何成功操作都会清除 |

- **助手提权**：`camera-register.exe` 以 `asInvoker` 启动；非管理员时用 `runas` 以 `<动作> --elevated-child` 重新启动自身并返回子进程退出码（取消 UAC 为 1223）。UAC 可能由另一个管理员账户确认，因此 HKCU 标记只由未提升的父进程在子进程成功后写入；已是管理员直接运行时写当前用户的 HKCU。
- **注销**：只删除固定的注册键，不加载旧 DLL；DLL 被接收软件占用时先改名再安排重启删除，目录无法立即删除时也安排重启删除，重新安装不会被这些待删除项影响。
- **卸载喵动**（`NSIS_HOOK_PREUNINSTALL`）：自动更新（`/UPDATE`）不动组件。否则只有当组件由当前用户安装（`RegisteredByUser`=1），或注册路径是当前用户目录下的旧版路径时才尝试注销；其他用户安装在受保护目录的组件直接保留。注销失败（取消 UAC、无管理员密码、组件占用）时询问“是否仍然卸载喵动”，静默卸载默认继续；受保护组件保留不影响系统安全，可重新安装喵动后在“高级设置”中点“卸载摄像头组件”清理，或由管理员清理。
- **安装/升级**（`NSIS_HOOK_POSTINSTALL`）：
  1. 注册指向非受保护路径（v0.3.0-beta 的 `%LOCALAPPDATA%\MIAO Motion\camera\softcam.dll`）→ 迁移到受保护目录；失败时明确提示旧组件存在安全风险，并指导在喵动“高级设置”中点“卸载摄像头组件”清理。
  2. 没有注册，但 `ReinstallPending`=1，或本次图形/被动安装开始时组件仍存在（Tauri 手动升级会先运行不带 `/UPDATE` 的旧卸载器，旧版卸载器不会写 `ReinstallPending`）→ 重新注册恢复；取消 UAC 只记录日志，其他失败提示可在喵动中重新安装组件。
  3. 已注册在受保护目录（例如同机其他用户安装）→ 什么也不做，不弹 UAC、不覆盖 DLL。
- **状态查询**：Tauri 命令 `native_camera_component_state` 返回 `{ registered, legacy, path_kind: "protected" | "legacy" | "none", registered_by_user }`，不返回含用户名的完整路径。

组件四色收帧验证见 `scripts/smoke-native-camera.ps1`（含 HKCU 标记）；安装版实际角色换色经 Tauri 到 DirectShow 的端到端验证见 `scripts/check-desktop-camera.mjs`，并由 `scripts/smoke-desktop.ps1` 检查受保护路径、ACL，以及同版本静默重装不重复部署、模拟手动升级（旧卸载器 `_?=` + 新安装包）后组件恢复、注销失败时静默卸载不中止、其他用户安装的组件不被注销。真实 OBS / 腾讯会议等的兼容性仍需逐个接收端确认。
