export const catChoices = { ears: ['pointed', 'round'], tail: ['long', 'short'], hair: ['tuft', 'smooth'], clothes: ['badge', 'hoodie'] } as const;
export type CatCategory = keyof typeof catChoices;
export type CatStyle = { name: string } & Record<CatCategory, string>;
type CatDocument = {
  asset: { generator?: string };
  nodes: { name?: string; scale?: number[] }[];
  materials: { name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }[];
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
  const style: CatStyle = { name: document.extensions.VRMC_vrm.meta.name, ears: 'pointed', tail: 'long', hair: 'tuft', clothes: 'badge' };
  for (const category of Object.keys(catChoices) as CatCategory[]) {
    const selected = catChoices[category].find(choice => document.nodes.some(n => n.name === `miao_part_${category}_${choice}` && n.scale?.[0] === 1));
    if (!selected) throw new Error('请使用首页的新版喵小动');
    style[category] = selected;
  }
  return { document, style, tail: new Uint8Array(buffer, 20 + length) };
}
export function exportCat(buffer: ArrayBuffer, style: CatStyle, colors: Record<string, number[]>) {
  const { document, tail } = readCat(buffer);
  document.extensions.VRMC_vrm.meta.name = style.name.trim().slice(0, 40) || '喵小动';
  for (const category of Object.keys(catChoices) as CatCategory[]) {
    if (!(catChoices[category] as readonly string[]).includes(style[category])) throw new Error('未知部件');
    for (const choice of catChoices[category]) {
      const node = document.nodes.find(n => n.name === `miao_part_${category}_${choice}`)!;
      node.scale = choice === style[category] ? [1,1,1] : [0,0,0];
    }
  }
  for (const material of document.materials) {
    const color = colors[material.name ?? ''];
    if (color?.length === 3 && color.every(x => Number.isFinite(x) && x >= 0 && x <= 1) && material.pbrMetallicRoughness) {
      const alpha = material.pbrMetallicRoughness.baseColorFactor?.[3] ?? 1;
      material.pbrMetallicRoughness.baseColorFactor = [...color, alpha];
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
