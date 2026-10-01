/**
 * 部件资产包（trait pack）：CharacterStudio manifest.json 思路的子集。
 *
 * manifest.json 示例见 docs/TRAIT_PACK.md。解析是宽松的：跳过缺字段的坏条目，
 * 空包直接抛错，调用方（character-creator.ts）无包时回退内置部件。
 *
 * 当前边界：外链部件的 modelUrl 只用于展示和选择。trait 网格合成
 * （把外链 .vrm 部件装配进导出的蒙皮 VRM，即 CharacterStudio 的
 * CharacterManager 那一步）尚未实现；在实现前，选了外链部件的角色
 * 导出时仍用内置几何。`generators` 里的 `trait-composer-v1` 是为此预留的桩。
 */

export type Trait = {
  /** 部件 id，如 'twin-tails' */
  id: string;
  /** 展示名 */
  name: string;
  /** 部件模型地址（VRM 1.0），相对 manifest.json 的路径 */
  modelUrl: string;
  /** 缩略图地址（可选），无则创建器用文字按钮代替 */
  thumbnail?: string;
};

export type TraitCategory = {
  /** 分类 id：'ears' | 'tail' | 'hair' | 'clothes' 才能替换对应内置分类 */
  id: string;
  label: string;
  collection: Trait[];
  /** 预留：衣服遮挡时身体部位的剔除层（合成器用，现在只读入） */
  cullingLayer?: string[];
  /** 预留：切换该分类部件时相机取景目标（合成器用，现在只读入） */
  cameraTarget?: string;
};

export type TraitPack = {
  id: string;
  label: string;
  version: number;
  traits: TraitCategory[];
};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

function parseTrait(data: unknown): Trait | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  const id = asString(value.id);
  const modelUrl = asString(value.modelUrl);
  if (!id || !modelUrl) return null; // 缺关键字段：跳过坏条目
  return { id, name: asString(value.name) ?? id, modelUrl, thumbnail: asString(value.thumbnail) };
}

function parseCategory(data: unknown): TraitCategory | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  const id = asString(value.id);
  if (!id || !Array.isArray(value.collection)) return null;
  const collection = value.collection.map(parseTrait).filter((trait): trait is Trait => trait !== null);
  if (collection.length === 0) return null; // 空分类：跳过
  const cullingLayer = Array.isArray(value.cullingLayer)
    ? value.cullingLayer.filter((layer): layer is string => typeof layer === 'string')
    : undefined;
  return {
    id,
    label: asString(value.label) ?? id,
    collection,
    cullingLayer: cullingLayer?.length ? cullingLayer : undefined,
    cameraTarget: asString(value.cameraTarget),
  };
}

/** 解析 manifest.json 对象；坏条目跳过，无可用部件时抛错。 */
export function parseTraitPack(data: unknown): TraitPack {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('部件包不是有效的 JSON 对象');
  const value = data as Record<string, unknown>;
  const traits = (Array.isArray(value.traits) ? value.traits : [])
    .map(parseCategory)
    .filter((category): category is TraitCategory => category !== null);
  if (traits.length === 0) throw new Error('部件包里没有可用部件');
  return {
    id: asString(value.id) ?? 'trait-pack',
    label: asString(value.label) ?? '部件包',
    version: typeof value.version === 'number' && Number.isFinite(value.version) ? value.version : 1,
    traits,
  };
}

/** 分类列表（id + 展示名），供 UI 动态生成步骤。 */
export function traitCategories(pack: TraitPack): { id: string; label: string }[] {
  return pack.traits.map(({ id, label }) => ({ id, label }));
}

/** 取某分类的部件；无包或未知分类返回空数组，调用方回退内置选项。 */
export function listTraits(pack: TraitPack | null | undefined, category: string): Trait[] {
  return pack?.traits.find(trait => trait.id === category)?.collection ?? [];
}

/**
 * 加载远端 manifest.json。404、坏 JSON、空包都会 reject，
 * 调用方 catch 后静默回退内置部件。
 */
export async function loadTraitPack(url: string): Promise<TraitPack> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`部件包加载失败（HTTP ${response.status}）`);
  return parseTraitPack(await response.json());
}
