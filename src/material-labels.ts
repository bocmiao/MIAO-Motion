/** Model material names are identifiers; keep them out of novice-facing controls. */
export const withoutOutline = (name: string) => name.replace(/\s*\(?outline\)?/gi, '').trim();
export function materialLabel(name: string, index: number): string {
  const clean = withoutOutline(name);
  if (clean === '奶油色毛发') return '毛发';
  if (clean === '深青色衣服') return '衣服';
  if (clean === '徽章与袖口') return '配饰';
  if (/^[\u3400-\u9fff\d\s·]+$/u.test(clean)) return clean;
  for (const [pattern, label] of [
    [/hairback/i, '后发'], [/hairfront|bang/i, '刘海'], [/hair/i, '头发'],
    [/eyehighlight|highlight/i, '眼睛高光'], [/eyewhite|sclera/i, '眼白'], [/eyeiris|iris|pupil/i, '瞳孔'],
    [/eyebrow|brow/i, '眉毛'], [/eyeline|eyelash/i, '眼线'], [/mouth|tooth|teeth|tongue/i, '嘴巴'],
    [/face/i, '脸'], [/body.*skin|skin/i, '身体皮肤'], [/shoe|foot/i, '鞋子'],
    [/dress/i, '连衣裙'], [/glove/i, '手套'], [/sock|stocking/i, '袜子'], [/hat|cap/i, '帽子'],
    [/bottom|pants|skirt/i, '下装'], [/cloth|tops|shirt|uniform/i, '上衣'], [/accessory|acc|ribbon/i, '饰品'],
  ] as const) if (pattern.test(clean)) return label;
  return `其他部位 ${index + 1}`;
}

export function materialLabels(names: string[]): string[] {
  const labels = names.map(materialLabel), seen = new Map<string, number>();
  return labels.map(label => {
    if (labels.filter(other => other === label).length === 1) return label;
    const number = (seen.get(label) ?? 0) + 1; seen.set(label, number);
    return `${label} ${number}`;
  });
}
