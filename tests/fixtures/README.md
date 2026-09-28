# 自动化 VRM 夹具

`minimal-avatar.vrm`、`minimal-avatar-v0.vrm` 和 `corrupt-avatar.vrm` 由 `scripts/generate-test-vrm.mjs` 确定性生成。它们由 MIAO Motion 项目原创并按仓库的 MPL-2.0 许可提供，可随源码与测试产物再分发。

- 两个有效夹具分别包含 VRM 1.0 / 0.x 元数据、必需 Humanoid 骨骼和跟随头部的红色几何面，用于解析、迁移、模型库、真实渲染像素和取景断言。合成骨骼测试另行验证手低于肩和头部世界方向。它们不是美术角色，不能代替真实 VRM 的材质、头发物理和面部表情兼容测试。
- `corrupt-avatar.vrm` 用于确认损坏文件能给出中文错误并保持程序可恢复。

修改生成器后运行 `npm run fixtures:generate`，并提交生成结果。
