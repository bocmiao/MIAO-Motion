# 喵动 DirectShow 虚拟摄像头

基于 MIT 许可的 [tshino/softcam](https://github.com/tshino/softcam)，固定来源提交 `5113173d22a6aac4c9f30c36bb2cf900afef05f4`。随附 `softcam/LICENSE`，Microsoft DirectShow Base Classes 原版权声明保留。修改：独立 CLSID、独立共享内存名称、喵动设备名称；增加中文注册助手，DLL 作为构建时资源嵌入助手。未使用 UnityCapture 的任何代码。

Windows 安装版的本机画面通过 Tauri 二进制消息发送到组件；固定 640×360、最多 15 FPS，BGR、无 alpha，按比例留边。只有一个帧请求在途，停止/退出释放发送器。接收端须支持 64 位 DirectShow；Windows Camera/UWP、32 位接收端不在这次实现的支持范围。输出组件与 Windows 11 MFVirtualCamera 探针相互独立，Windows 10 也可使用 DirectShow。

```powershell
cmake -S native -B native/build -A x64
cmake --build native/build --config Release
```

这是实验功能。用户主动安装组件时请求 UAC 授权，默认不注册。助手只部署自身嵌入的 DLL 到 Program Files/MIAO Motion Camera，目录和文件仅管理员/System 可写，普通用户只读/执行；不会以管理员权限加载用户目录中的相邻 DLL。升级时迁移既有注册。NSIS 卸载钩子注销本组件固定注册键，取消权限则中止卸载。等待 UAC 和退出码在后台线程执行。安装流程会改变系统摄像头列表，不会访问实体摄像头或网络。

组件四色收帧验证见 `scripts/smoke-native-camera.ps1`；安装版实际角色换色经 Tauri 到 DirectShow 的端到端验证见 `scripts/check-desktop-camera.mjs`，并由 `scripts/smoke-desktop.ps1` 检查受保护路径、ACL 与卸载注销。真实 OBS / 腾讯会议等的兼容性仍需逐个接收端确认。
