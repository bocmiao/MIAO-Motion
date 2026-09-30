/** Versioned recipe shared by drafts, VRM extras and future animal/humanoid bases. */
export type CharacterFamily = 'animal' | 'humanoid';
export const partOptions = {
  ears: { pointed: '尖耳朵', round: '圆耳朵', tall: '高耳朵', folded: '折耳朵' },
  tail: { long: '长尾巴', short: '短尾球', fluffy: '蓬松尾', curled: '卷尾巴' },
  hair: { tuft: '小发簇', smooth: '清爽', side: '侧刘海', double: '双发簇' },
  clothes: { badge: '徽章上衣', hoodie: '连帽上衣', scarf: '围巾上衣', bow: '蝴蝶结上衣' },
} as const;
/** 面部细节参数（hamr 参数 schema 子集）：鼻 / 脸颊 / 下巴 / 耳朵。 */
export type FaceDetails = {
  nose: { bridgeWidth: number; tip: number; definition: number };
  cheeks: { fullness: number };
  chin: { width: number };
  ears: { size: number; point: number };
};
/** 体型参数（hamr 参数 schema 子集）。 */
export type BodyShape = { height: number; shoulderWidth: number; waistWidth: number; hipWidth: number };
export type CharacterRecipe = {
  version: 1 | 2; baseId: string; name: string;
  parts: Record<keyof typeof partOptions, string>;
  proportions: { head: number; width: number };
  face: { eyeShape: string; eyeSize: number; brows: string; mouth: string } & FaceDetails;
  body: BodyShape;
  colors: { fur: string; outfit: string; accent: string; eyes: string };
};
export type CharacterBase = {
  id: string; family: CharacterFamily; label: string; skeleton: 'vrm-humanoid-1';
  parts: Record<keyof typeof partOptions, Record<string, string>>; presets: { label: string; head: number; width: number }[];
};
// Future B/C bases register their own parts/presets and generator with the same VRM contract.
// No placeholder animal/human option is exposed before its assets and generator are available.
export const characterBases: CharacterBase[] = [{ id: 'miao-cat-v1', family: 'animal', label: '喵小动猫咪', skeleton: 'vrm-humanoid-1', parts: partOptions,
  presets: [{ label: '标准猫咪', head: 1, width: 1 }, { label: '大头幼猫', head: 1.18, width: 0.9 }, { label: '圆滚滚猫咪', head: 1.05, width: 1.2 }],
}];
export const defaultCharacter: CharacterRecipe = {
  version: 2, baseId: 'miao-cat-v1', name: '我的猫咪',
  parts: { ears: 'pointed', tail: 'long', hair: 'tuft', clothes: 'badge' },
  proportions: { head: 1, width: 1 },
  face: {
    eyeShape: 'oval', eyeSize: 1, brows: 'natural', mouth: 'natural',
    nose: { bridgeWidth: 1, tip: 1, definition: 1 },
    cheeks: { fullness: 1 }, chin: { width: 1 }, ears: { size: 1, point: 0.5 },
  },
  body: { height: 1, shoulderWidth: 1, waistWidth: 1, hipWidth: 1 },
  colors: { fur: '#f8e8d3', outfit: '#356969', accent: '#ffcb61', eyes: '#363544' },
};
export const palettes = [
  { label: '奶油薄荷', fur: '#f8e8d3', outfit: '#356969', accent: '#ffcb61', eyes: '#363544' },
  { label: '桃子牛奶', fur: '#fff0e8', outfit: '#bc646e', accent: '#e3b97b', eyes: '#6a404f' },
  { label: '午夜星空', fur: '#545767', outfit: '#526b99', accent: '#f5cf72', eyes: '#76bfb1' },
  { label: '橘子汽水', fur: '#f0ba71', outfit: '#547a55', accent: '#fff0bf', eyes: '#433b31' },
];
export function normalizeCharacter(input: unknown): CharacterRecipe {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const value = input as Partial<CharacterRecipe>;
  // v1 草稿自动补默认值升级到 v2；只有未来的 v3+ 才需要更新程序。
  if (value.version !== undefined && value.version !== 1 && value.version !== 2) throw new Error('此草稿来自更新版本，请更新喵动后打开');
  if (value.baseId !== undefined && !characterBases.some(base => base.id === value.baseId)) throw new Error('这个底座尚未安装，原草稿已保留');
  const result = structuredClone(defaultCharacter);
  result.baseId = value.baseId ?? defaultCharacter.baseId;
  const base = characterBases.find(base => base.id === result.baseId)!;
  if (typeof value.name === 'string') result.name = value.name.trim().slice(0, 40) || defaultCharacter.name;
  const selected = (candidate: unknown, choices: readonly string[], fallback: string) => typeof candidate === 'string' && choices.includes(candidate) ? candidate : fallback;
  const bounded = (candidate: unknown, low: number, high: number) => typeof candidate === 'number' && Number.isFinite(candidate) ? Math.min(high, Math.max(low, candidate)) : 1;
  const num = (candidate: unknown, low: number, high: number, fallback: number) => typeof candidate === 'number' && Number.isFinite(candidate) ? Math.min(high, Math.max(low, candidate)) : fallback;
  for (const category of Object.keys(partOptions) as (keyof typeof partOptions)[]) result.parts[category] = selected(value.parts?.[category], Object.keys(base.parts[category]), Object.keys(base.parts[category])[0] ?? '');
  result.proportions.head = bounded(value.proportions?.head, 0.8, 1.25);
  result.proportions.width = bounded(value.proportions?.width, 0.8, 1.25);
  result.face.eyeSize = bounded(value.face?.eyeSize, 0.7, 1.4);
  result.face.eyeShape = selected(value.face?.eyeShape, ['oval', 'round', 'gentle'], 'oval');
  result.face.brows = selected(value.face?.brows, ['natural', 'short', 'bold'], 'natural');
  result.face.mouth = selected(value.face?.mouth, ['natural', 'small', 'open'], 'natural');
  // v2 新增：面部细节与体型（v1 草稿缺这些字段时补默认值）。
  result.face.nose = {
    bridgeWidth: num(value.face?.nose?.bridgeWidth, 0.7, 1.4, 1),
    tip: num(value.face?.nose?.tip, 0.7, 1.4, 1),
    definition: num(value.face?.nose?.definition, 0.7, 1.4, 1),
  };
  result.face.cheeks = { fullness: num(value.face?.cheeks?.fullness, 0.7, 1.4, 1) };
  result.face.chin = { width: num(value.face?.chin?.width, 0.7, 1.4, 1) };
  result.face.ears = { size: num(value.face?.ears?.size, 0.7, 1.4, 1), point: num(value.face?.ears?.point, 0, 1, 0.5) };
  result.body = {
    height: num(value.body?.height, 0.85, 1.3, 1),
    shoulderWidth: num(value.body?.shoulderWidth, 0.75, 1.3, 1),
    waistWidth: num(value.body?.waistWidth, 0.75, 1.3, 1),
    hipWidth: num(value.body?.hipWidth, 0.75, 1.3, 1),
  };
  for (const color of Object.keys(result.colors) as (keyof CharacterRecipe['colors'])[]) {
    const candidate = value.colors?.[color];
    if (typeof candidate === 'string' && /^#[0-9a-f]{6}$/i.test(candidate)) result.colors[color] = candidate;
  }
  result.version = 2;
  return result;
}
