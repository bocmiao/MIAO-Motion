# 自动化 VRM 夹具

`minimal-avatar.vrm` 和 `corrupt-avatar.vrm` 由 `scripts/generate-test-vrm.mjs` 确定性生成。它们由 MIAO Motion 项目原创并按仓库的 MPL-2.0 许可提供，可随源码与测试产物再分发。

- `minimal-avatar.vrm` 只包含 VRM 1.0 元数据、15 个必需 Humanoid 骨骼和一个三角形，用于解析、迁移、模型医生和模型库自动化；它不是给用户直播使用的示例角色。
- `corrupt-avatar.vrm` 用于确认损坏文件能给出中文错误并保持程序可恢复。

修改生成器后运行 `npm run fixtures:generate`，并提交生成结果。
