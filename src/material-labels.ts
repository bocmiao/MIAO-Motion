/** Model material names are identifiers; keep them out of novice-facing controls. */
export const withoutOutline = (name: string) => name.replace(/\s*\(?outline\)?/gi, '').trim();
export function materialLabel(name: string, index: number): string {
  const clean = withoutOutline(name);
  if (/^[\u3400-\u9fff\d\s·]+$/u.test(clean)) return clean;
  for (const [pattern, label] of [
    [/hairback/i, '后发'], [/hairfront|bang/i, '刘海'], [/hair/i, '头发'],
    [/eyehighlight|highlight/i, '眼睛高光'], [/eyewhite|sclera/i, '眼白'], [/eyeiris|iris|pupil/i, '瞳孔'],
    [/eyebrow|brow/i, '眉毛'], [/eyeline|eyelash/i, '眼线'], [/mouth|tooth|teeth|tongue/i, '嘴巴'],
    [/face/i, '脸'], [/body.*skin|skin/i, '身体皮肤'], [/shoe|foot/i, '鞋子'],
    [/bottom|pants|skirt/i, '下装'], [/cloth|tops|shirt|uniform/i, '上衣'], [/accessory|acc|ribbon/i, '饰品'],
  ] as const) if (pattern.test(clean)) return label;
  return `其他部位 ${index + 1}`;
}
