export const catChoices = { ears: ['pointed', 'round', 'tall', 'folded'], tail: ['long', 'short', 'fluffy', 'curled'], hair: ['tuft', 'smooth', 'side', 'double'], clothes: ['badge', 'hoodie', 'scarf', 'bow'] } as const;
/** 注意：新增内置部件分类时，需同步更新 character-spec.ts 的 partOptions（Node 单测要求 .ts 文件内不用相对裸导入，见 tests/cat-vrm.test.mjs）。 */
export type CatCategory = keyof typeof catChoices;
export type CatStyle = { name: string } & Record<CatCategory, string>;
type Accessor = { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; min?: number[]; max?: number[]; sparse?: unknown };
type CatMaterial = { name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[] }; extensions?: { VRMC_materials_mtoon?: { shadeColorFactor?: number[] } } };
type CatDocument = {
  asset: { generator?: string };
  extras?: { miaoCharacter?: { name: string; parts: Record<string, string>; colors: Record<string, string> } };
  nodes: { name?: string; scale?: number[]; children?: number[] }[];
  meshes?: { primitives: { attributes: Record<string, number>; targets?: Record<string, number>[] }[] }[];
  accessors?: Accessor[];
  bufferViews?: { byteOffset?: number; byteLength: number; byteStride?: number }[];
  materials: CatMaterial[];
  extensions: { VRMC_vrm: { meta: { name: string } } };
};
export function readCat(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
      || view.getUint32(8, true) !== buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('无效的 VRM 文件');
  const length = view.getUint32(12, true);
  if (20 + length + 8 > buffer.byteLength) throw new Error('VRM 数据不完整');
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))) as CatDocument;
  if (document.asset.generator !== 'MIAO Motion original procedural mascot') throw new Error('仅适用于喵小动');
  const style = { name: document.extensions.VRMC_vrm.meta.name, ...Object.fromEntries(Object.keys(catChoices).map(category => [category, catChoices[category as CatCategory][0]])) } as CatStyle;
  for (const category of Object.keys(catChoices) as CatCategory[]) {
    const selected = catChoices[category].find(choice => document.nodes.some(n => n.name === `miao_part_${category}_${choice}` && n.scale?.[0] === 1));
    if (!selected) throw new Error('请使用首页的新版喵小动');
    style[category] = selected;
  }
  return { document, style, tail: new Uint8Array(buffer, 20 + length) };
}
// Characters exported by v0.3.0 and earlier carried glTF validation errors (empty `children` arrays and
// morph-target POSITION accessors without bounds). Repair them so re-exported files pass the validator.
function repairDocument(document: CatDocument, tail: Uint8Array) {
  for (const node of document.nodes) if (Array.isArray(node.children) && !node.children.length) delete node.children;
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const binLength = tail.byteLength >= 8 && view.getUint32(4, true) === 0x004e4942 ? view.getUint32(0, true) : 0;
  const positions = new Set<number>();
  for (const mesh of document.meshes ?? []) for (const primitive of mesh.primitives) {
    if (primitive.attributes.POSITION !== undefined) positions.add(primitive.attributes.POSITION);
    for (const target of primitive.targets ?? []) if (target.POSITION !== undefined) positions.add(target.POSITION);
  }
  for (const index of positions) {
    const accessor = document.accessors?.[index];
    const bufferView = accessor?.bufferView === undefined ? undefined : document.bufferViews?.[accessor.bufferView];
    if (!accessor || !bufferView || (accessor.min && accessor.max) || accessor.sparse || accessor.componentType !== 5126 || accessor.type !== 'VEC3') continue;
    const stride = bufferView.byteStride ?? 12, start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    if (!accessor.count || start + stride * (accessor.count - 1) + 12 > Math.min(binLength, (bufferView.byteOffset ?? 0) + bufferView.byteLength)) continue;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < accessor.count; i++) for (let axis = 0; axis < 3; axis++) {
      const value = view.getFloat32(8 + start + i * stride + axis * 4, true);
      min[axis] = Math.min(min[axis]!, value); max[axis] = Math.max(max[axis]!, value);
    }
    if ([...min, ...max].every(Number.isFinite)) { accessor.min = min; accessor.max = max; }
  }
}

export function exportCat(buffer: ArrayBuffer, style: CatStyle, colors: Record<string, number[]>) {
  const { document, tail } = readCat(buffer);
  repairDocument(document, tail);
  document.extensions.VRMC_vrm.meta.name = style.name.trim().slice(0, 40) || '喵小动';
  for (const category of Object.keys(catChoices) as CatCategory[]) {
    if (!(catChoices[category] as readonly string[]).includes(style[category])) throw new Error('未知部件');
    for (const choice of catChoices[category]) {
      const node = document.nodes.find(n => n.name === `miao_part_${category}_${choice}`)!;
      if (!node) { if (choice === style[category]) throw new Error('这个旧版角色没有所选部件，请在创建器中制作新版角色'); continue; }
      node.scale = choice === style[category] ? [1,1,1] : [0,0,0];
    }
  }
  for (const material of document.materials) {
    const color = colors[material.name ?? ''];
    if (color?.length === 3 && color.every(x => Number.isFinite(x) && x >= 0 && x <= 1) && material.pbrMetallicRoughness) {
      const alpha = material.pbrMetallicRoughness.baseColorFactor?.[3] ?? 1;
      material.pbrMetallicRoughness.baseColorFactor = [...color, alpha];
      // MToon 的阴影色由主色派生：换色时保持同步，否则描边/明暗会和主色脱节。
      const mtoon = material.extensions?.VRMC_materials_mtoon;
      if (mtoon && Array.isArray(mtoon.shadeColorFactor)) mtoon.shadeColorFactor = color.map(x => Math.max(0, Math.min(1, x * 0.78)));
    }
  }
  if (document.extras?.miaoCharacter) {
    document.extras.miaoCharacter.name = document.extensions.VRMC_vrm.meta.name;
    for (const category of Object.keys(catChoices) as CatCategory[]) document.extras.miaoCharacter.parts[category] = style[category];
    for (const [material, field] of Object.entries({ '毛发': 'fur', '衣服': 'outfit', '配饰': 'accent', '奶油色毛发': 'fur', '深青色衣服': 'outfit', '徽章与袖口': 'accent', '瞳孔': 'eyes' })) {
      const color = colors[material];
      if (color?.length === 3 && color.every(x => Number.isFinite(x) && x >= 0 && x <= 1)) document.extras.miaoCharacter.colors[field] = '#' + color.map(x => Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055) * 255).toString(16).padStart(2, '0')).join('');
    }
  }
  const encoded = new TextEncoder().encode(JSON.stringify(document));
  const length = Math.ceil(encoded.length / 4) * 4;
  const output = new Uint8Array(20 + length + tail.length);
  const header = new DataView(output.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, output.length, true);
  header.setUint32(12, length, true); header.setUint32(16, 0x4e4f534a, true);
  output.fill(32, 20, 20 + length); output.set(encoded, 20); output.set(tail, 20 + length);
  return output;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i;
/** File name for a downloaded character that Windows can always save (reserved names, trailing dots/spaces). */
export function safeFileName(name: string, extension = '.vrm') {
  let base = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().replace(/[.\s]+$/u, '');
  const stem = base.split('.')[0] ?? '';
  if (WINDOWS_RESERVED.test(stem.trim())) base = `${stem.trim()}_${base.slice(stem.length)}`;
  return (base || '喵小动') + extension;
}
