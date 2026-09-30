import { Euler, Quaternion } from 'three';

// iFacialMocap developer protocol: https://ifacialmocap.jimdofree.com/for-developer/
/**
 * Expression channels are kept even when a packet carries no `=head#` field (some iFacialMocap settings and
 * versions omit it); `head` is then null and the caller keeps the previous head pose. A present but malformed
 * head field marks a corrupted packet and rejects it entirely.
 * @param {string} packet
 * @returns {{ categories: { categoryName: string; score: number; index: number; displayName: string }[]; head: Quaternion | null } | null}
 */
export function parsePhonePacket(packet) {
  if (packet.length > 8192) return null;
  const channels = new Map();
  /** @type {Quaternion | null} */
  let head = null;
  let malformedHead = false;
  for (const field of packet.trim().split('|')) {
    const expression = /^([a-zA-Z0-9]+(?:_[LR])?)\s*[-&]\s*(-?\d+(?:\.\d+)?)$/.exec(field);
    if (expression) {
      const name = (expression[1] ?? '').replace(/_L$/, 'Left').replace(/_R$/, 'Right');
      const score = Math.min(1, Math.max(0, Number(expression[2]) / 100));
      if (Number.isFinite(score)) channels.set(name, score);
    } else if (field.startsWith('=head#')) {
      const values = field.slice(6).split(',').slice(0, 3);
      const angles = values.map(Number);
      if (values.length === 3 && values.every(x => x.trim()) && angles.every(x => Number.isFinite(x) && Math.abs(x) <= 360)) {
        head = new Quaternion().setFromEuler(new Euler((angles[0] ?? 0) * Math.PI / 180, -(angles[1] ?? 0) * Math.PI / 180, -(angles[2] ?? 0) * Math.PI / 180, 'YXZ'));
      } else malformedHead = true;
    }
  }
  const categories = [...channels].map(([categoryName, score], index) => ({ categoryName, score, index, displayName: '' }));
  return categories.length && !malformedHead ? { categories, head } : null;
}
