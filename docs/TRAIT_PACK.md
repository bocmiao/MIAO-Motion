# 部件资产包（trait pack）离线生产管线

创建器的耳朵 / 尾巴 / 头发 / 衣服四类部件，内置的是程序化几何。
想要美术生产的精美部件，不用改代码：按 [saturday06/vrm-addon-for-blender](https://github.com/saturday06/vrm-addon-for-blender)（MIT）
在 Blender 里做 VRM 部件，导出后填一个 `manifest.json`，放到 `assets/traits/` 下即可。

## 目录结构

```
assets/traits/
  manifest.json            # 部件包清单（格式见 src/trait-pack.ts 顶部注释）
  hair/twin-tails.vrm      # 部件模型（VRM 1.0）
  hair/twin-tails.png      # 缩略图（创建器里点选用）
  ...
```

## manifest.json 格式

```json
{
  "id": "miao-traits-v1",
  "label": "喵小动部件包",
  "version": 1,
  "traits": [{
    "id": "hair",
    "label": "发型",
    "collection": [
      { "id": "twin-tails", "name": "双马尾", "modelUrl": "./hair/twin-tails.vrm", "thumbnail": "./hair/twin-tails.png" }
    ],
    "cullingLayer": ["scalp"],
    "cameraTarget": "head"
  }]
}
```

- `id` 必须是 `ears`、`tail`、`hair`、`clothes` 之一，才能替换对应分类的内置选项。
- 有部件包时创建器自动用它（含缩略图条），没有就回退内置——两种情况都可正常创建角色。
- `cullingLayer`（衣服遮挡身体部位剔除层）和 `cameraTarget`（切换部件时相机取景）目前是给将来
  trait 合成器（`trait-composer-v1`）预留的字段，现在读入但不使用。

## Blender 端约定

1. 在 Blender 中按 VRM 1.0 人体骨骼命名建部件模型，用 vrm-addon-for-blender 导出 `.vrm`。
2. 材质走 `VRMC_materials_mtoon` 扩展（和本项目程序化角色一致的动漫风渲染）。
3. 截图一张正脸/正侧缩略图，命名与模型一致放同目录。

## 当前边界

- 部件模型的外链（modelUrl）目前**只用于展示和选择**：trait 网格合成（把外链部件拼进导出的 VRM）
  尚未实现，`src/trait-pack.ts` 头部有说明。实现它之前，选外链部件的角色导出时仍用内置几何。
