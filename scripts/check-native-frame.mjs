import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
const png = PNG.sync.read(readFileSync('test-results/native-camera.png'));
assert.equal(png.width, 640); assert.equal(png.height, 360);
for (const [x, y, rgb] of [[100, 50, [255,255,0]], [500,50,[0,255,255]], [100,300,[255,0,0]], [500,300,[0,0,255]]]) {
  const i = (y * png.width + x) * 4;
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(png.data[i + c] - rgb[c]) < 8, `Native pixel ${x},${y} channel ${c}`);
}
console.log('DirectShow receiver verified: dimensions, four colors and orientation.');
