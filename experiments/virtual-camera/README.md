# 原生虚拟摄像头：隔离技术探针

范围：编译、链接并调用 Windows 11 的 `MFIsVirtualCameraTypeSupported`，输出当前运行环境的能力查询结果。**这不是可用的摄像头实现**，不会注册设备、读摄像头、安装驱动或发送画面。不要给用户展示“原生虚拟摄像头已支持”。

```sh
cargo run --locked --manifest-path experiments/virtual-camera/Cargo.toml
```

仅在 Windows 11 Build 22000+ 上运行 Windows 产物；它直接链接该系统 API，不面向 Windows 10 分发。CI 的 Windows Server 能编译和调用，不代表 Windows 11 用户桌面/会议软件兼容。Linux 分支只打印平台限制，不能充当 Windows API 验证。

后续工程（未完成，不能归为“仅等真机”）：

1. 实现可激活的 COM `IMFMediaSource` / `IMFMediaStream`，时间戳、媒体类型协商、帧请求、关闭和异常恢复。
2. WebView 渲染帧到原生源的有界缓冲通路、背压与分辨率切换；明确 BGRA→NV12/RGB 格式转换，不传 alpha。
3. 用户主动开启时调用 `MFCreateVirtualCamera`，使用当前用户/会话生命周期，停止和卸载清理注册，避免管理员级常驻设备。
4. Tauri 命令权限、资源上限、设备可用性提示和自动回退；Windows 10 单独评估 DirectShow，不能假设该 API 存在。
5. 自动化验证颜色、帧时序、重连和资源释放；再用 OBS/会议软件验证真实接收端。

决策：优先系统 API，不在此轮引入未审计的虚拟摄像头驱动；当前用户可用路径仍是 OBS 虚拟摄像头。此探针完成第二轮任务 17 的初步可编译验证，不完成 v0.4 原生摄像头交付。

核对来源（2026-09-28）：

- [Microsoft API 与最低 Build 22000 要求](https://learn.microsoft.com/en-us/windows/win32/api/mfvirtualcamera/nf-mfvirtualcamera-mfisvirtualcameratypesupported)；第二轮审计的“必须 22H2”不是此能力查询 API 的最低版本。
- [Microsoft windows-rs 0.62.2 签名](https://microsoft.github.io/windows-docs-rs/doc/windows/Win32/Media/MediaFoundation/fn.MFIsVirtualCameraTypeSupported.html)
- [Microsoft 完整 MediaSource 示例](https://github.com/microsoft/Windows-Camera/tree/master/Samples/VirtualCamera)；本探针未复制示例代码。
