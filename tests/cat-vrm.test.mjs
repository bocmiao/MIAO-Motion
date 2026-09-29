import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCat, exportCat } from '../src/cat-vrm.ts';
const bytes = () => { const b = readFileSync('public/examples/miao-cat.vrm'); return b.buffer.slice(b.byteOffset, b.byteOffset+b.length); };
test('cat export preserves binary, skeleton, expressions, authors and license while changing parts/name/colors', () => {
  const source = bytes(), before = readCat(source);
  const style = { name: '我的小猫', ears:'round', tail:'short', hair:'smooth', clothes:'hoodie' };
  const output = exportCat(source, style, { '深青色衣服': [0.1,0.2,0.3] });
  const after = readCat(output.buffer);
  assert.deepEqual(after.style,style);
  assert.deepEqual(after.tail,before.tail);
  assert.deepEqual(after.document.extensions.VRMC_vrm.humanoid,before.document.extensions.VRMC_vrm.humanoid);
  assert.deepEqual(after.document.extensions.VRMC_vrm.expressions,before.document.extensions.VRMC_vrm.expressions);
  assert.deepEqual({...after.document.extensions.VRMC_vrm.meta,name:''},{...before.document.extensions.VRMC_vrm.meta,name:''});
  assert.deepEqual(after.document.materials.find(m=>m.name==='深青色衣服').pbrMetallicRoughness.baseColorFactor,[0.1,0.2,0.3,1]);
  assert.notDeepEqual(before.document.extensions.VRMC_vrm.expressions.preset.angry,before.document.extensions.VRMC_vrm.expressions.preset.sad);
  assert.throws(()=>exportCat(source,{...style,ears:'bad'},{}));
});
