import { Euler, Quaternion } from 'three';

// iFacialMocap developer protocol: https://ifacialmocap.jimdofree.com/for-developer/
/** @param {string} packet */
export function parsePhonePacket(packet) {
  if (packet.length > 8192) return null;
  const channels = new Map();
  let head = null;
  for (const field of packet.trim().split('|')) {
    const expression = /^([a-zA-Z]+(?:_[LR])?)\s*[-&]\s*(-?\d+(?:\.\d+)?)$/.exec(field);
    if (expression) {
      const name = (expression[1] ?? '').replace(/_L$/, 'Left').replace(/_R$/, 'Right');
      const score = Math.min(1, Math.max(0, Number(expression[2]) / 100));
      if (Number.isFinite(score)) channels.set(name, score);
    } else if (field.startsWith('=head#')) {
      const values = field.slice(6).split(',').slice(0, 3);
      const angles = values.map(Number);
      if (values.length === 3 && values.every(x => x.trim()) && angles.every(x => Number.isFinite(x) && Math.abs(x) <= 360)) {
        head = new Quaternion().setFromEuler(new Euler((angles[0] ?? 0) * Math.PI / 180, -(angles[1] ?? 0) * Math.PI / 180, -(angles[2] ?? 0) * Math.PI / 180, 'YXZ'));
      }
    }
  }
  const categories = [...channels].map(([categoryName, score], index) => ({ categoryName, score, index, displayName: '' }));
  return categories.length && head ? { categories, head } : null;
}
