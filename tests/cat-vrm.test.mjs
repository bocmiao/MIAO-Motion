import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import validator from 'gltf-validator';
import { readCat, exportCat, safeFileName } from '../src/cat-vrm.ts';
const bytes = () => { const b = readFileSync('public/examples/miao-cat.vrm'); return b.buffer.slice(b.byteOffset, b.byteOffset+b.length); };
test('cat export preserves binary, skeleton, expressions, authors and license while changing parts/name/colors', () => {
  const source = bytes(), before = readCat(source);
  const style = { name: '我的小猫', ears:'round', tail:'short', hair:'smooth', clothes:'hoodie' };
  const output = exportCat(source, style, { '衣服': [0.1,0.2,0.3] });
  const after = readCat(output.buffer);
  assert.deepEqual(after.style,style);
  assert.deepEqual(after.tail,before.tail);
  assert.deepEqual(after.document.extensions.VRMC_vrm.humanoid,before.document.extensions.VRMC_vrm.humanoid);
  assert.deepEqual(after.document.extensions.VRMC_vrm.expressions,before.document.extensions.VRMC_vrm.expressions);
  assert.deepEqual({...after.document.extensions.VRMC_vrm.meta,name:''},{...before.document.extensions.VRMC_vrm.meta,name:''});
  assert.deepEqual(after.document.materials.find(m=>m.name==='衣服').pbrMetallicRoughness.baseColorFactor,[0.1,0.2,0.3,1]);
  assert.notDeepEqual(before.document.extensions.VRMC_vrm.expressions.preset.angry,before.document.extensions.VRMC_vrm.expressions.preset.sad);
  assert.throws(()=>exportCat(source,{...style,ears:'bad'},{}));
});

const validate = async data => (await validator.validateBytes(new Uint8Array(data), { maxIssues: 0 })).issues;
const errorCodes = issues => [...new Set(issues.messages.filter(m => m.severity === 0).map(m => m.code))].sort();
// Rebuild a GLB whose JSON chunk is edited while the binary chunk is kept byte for byte.
function withJson(buffer, edit) {
  const { document, tail } = readCat(buffer);
  edit(document);
  const encoded = new TextEncoder().encode(JSON.stringify(document)), length = Math.ceil(encoded.length / 4) * 4;
  const output = new Uint8Array(20 + length + tail.length), view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, output.length, true);
  view.setUint32(12, length, true); view.setUint32(16, 0x4e4f534a, true);
  output.fill(32, 20, 20 + length); output.set(encoded, 20); output.set(tail, 20 + length);
  return output.buffer;
}

test('generated mascot and its export pass the Khronos glTF validator with 0 errors', async () => {
  const generated = await validate(bytes());
  assert.equal(generated.numErrors, 0, JSON.stringify(generated.messages.filter(m => m.severity === 0).slice(0, 3)));
  const exported = await validate(exportCat(bytes(), { name: 'CON', ears: 'round', tail: 'short', hair: 'smooth', clothes: 'hoodie' }, { '眼白': [0.9, 0.9, 0.8] }));
  assert.equal(exported.numErrors, 0);
});

test('re-exporting a v0.3.0 mascot repairs its empty children and unbounded morph targets', async () => {
  // v0.3.0 wrote `children: []` on every leaf node and no min/max on morph-target POSITION accessors.
  const legacy = withJson(bytes(), document => {
    for (const node of document.nodes) node.children ??= [];
    for (const mesh of document.meshes) for (const primitive of mesh.primitives) for (const target of primitive.targets ?? []) {
      delete document.accessors[target.POSITION].min; delete document.accessors[target.POSITION].max;
    }
  });
  const before = await validate(legacy);
  assert.deepEqual(errorCodes(before), ['EMPTY_ENTITY', 'MESH_PRIMITIVE_POSITION_ACCESSOR_WITHOUT_BOUNDS']);
  const legacyDocument = readCat(legacy).document;
  const expectedErrors = legacyDocument.nodes.filter(n => !n.children.length).length + legacyDocument.meshes.flatMap(m => m.primitives.flatMap(p => p.targets ?? [])).length;
  assert.equal(before.numErrors, expectedErrors);
  const repaired = exportCat(legacy, { name: '旧猫', ears: 'pointed', tail: 'long', hair: 'tuft', clothes: 'badge' }, {});
  assert.equal((await validate(repaired)).numErrors, 0);
  // Recomputed bounds equal the ones the generator writes today.
  const fresh = readCat(bytes()).document, fixed = readCat(repaired.buffer).document;
  for (const mesh of fresh.meshes) for (const primitive of mesh.primitives) for (const target of primitive.targets ?? []) {
    const index = target.POSITION;
    assert.deepEqual([fixed.accessors[index].min, fixed.accessors[index].max], [fresh.accessors[index].min, fresh.accessors[index].max]);
  }
});

test('export file names avoid Windows reserved names, trailing dots/spaces and forbidden characters', () => {
  for (const [name, expected] of [
    ['CON', 'CON_.vrm'], ['con', 'con_.vrm'], ['Nul.backup', 'Nul_.backup.vrm'], ['COM1', 'COM1_.vrm'], ['lpt9 .txt', 'lpt9_.txt.vrm'],
    ['PRN', 'PRN_.vrm'], ['aux.', 'aux_.vrm'], ['我的猫. . ', '我的猫.vrm'], ['a<b>:c', 'a_b__c.vrm'], ['...', '喵小动.vrm'],
    ['COM10', 'COM10.vrm'], ['CONSOLE', 'CONSOLE.vrm'], ['奶茶猫', '奶茶猫.vrm'],
  ]) assert.equal(safeFileName(name), expected, name);
});
