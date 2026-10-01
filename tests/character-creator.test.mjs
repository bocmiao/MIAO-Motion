import test from 'node:test';
import assert from 'node:assert/strict';
import validator from 'gltf-validator';
import { generateMiao } from '../src/generate-miao.mjs';
import { normalizeCharacter, characterBases } from '../src/character-spec.ts';
import { materialLabel, materialLabels } from '../src/material-labels.ts';
import { parseSettings, createSettingsProfile, parseSettingsProfile } from '../src/app-utils.mjs';

test('every cat part and bounded recipe generates a valid skinned VRM with resumable metadata', async () => {
  for (let i = 0; i < 4; i++) {
    const recipe = normalizeCharacter({ name: '团子', parts: Object.fromEntries(Object.entries(characterBases[0].parts).map(([key, choices]) => [key, Object.keys(choices)[i]])), proportions: { head: i % 2 ? 1.25 : 0.8, width: i % 2 ? 0.8 : 1.25 }, face: { eyeShape: 'round', eyeSize: 1.4, brows: 'bold', mouth: 'small' } });
    const bytes = generateMiao(recipe);
    const issues = (await validator.validateBytes(bytes, { maxIssues: 0 })).issues;
    assert.equal(issues.numErrors, 0, JSON.stringify(issues.messages.filter(m => m.severity === 0)));
    const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + new DataView(bytes.buffer).getUint32(12, true))));
    assert.deepEqual(doc.extras.miaoCharacter, recipe);
    for (const {node} of Object.values(doc.extensions.VRMC_vrm.humanoid.humanBones)) assert.deepEqual(doc.nodes[node].scale ?? [1,1,1], [1,1,1]);
    assert.ok(doc.skins[0].joints.length >= 17);
    assert.ok(doc.meshes.some(mesh => mesh.primitives[0].attributes.WEIGHTS_0 !== undefined));
    assert.ok(doc.extensions.VRMC_vrm.expressions.preset.blinkLeft);
    for (const [key, choice] of Object.entries(recipe.parts)) assert.equal(doc.nodes.find(n => n.name === `miao_part_${key}_${choice}`).scale[0], 1);
  }
  assert.throws(() => normalizeCharacter({ version: 3 }), /更新/);
  assert.throws(() => normalizeCharacter({ baseId: 'future-human' }), /保留/);
  assert.equal(normalizeCharacter({ proportions: { head: Infinity, width: -1 } }).proportions.width, 0.8);
});

test('VRoid labels hide identifiers and whole-body preference survives export/import', () => {
  for (const name of ['Body_00_SKIN', 'HairBack_00_HAIR (Outline)', 'EyeIris_00_EYE', 'unknown_17']) assert.doesNotMatch(materialLabel(name, 1), /[a-z]/i);
  assert.equal(materialLabel('深青色衣服', 0), '衣服');
  assert.deepEqual(materialLabels(['Tops_A', 'Tops_B', 'Cloth_Dress', 'Cloth_Gloves', 'Cloth_Socks', 'Cloth_Hat']), ['上衣 1', '上衣 2', '连衣裙', '手套', '袜子', '帽子']);
  const settings = parseSettings('{"bodyTracking":true}');
  assert.equal(parseSettingsProfile(JSON.stringify(createSettingsProfile(settings))).bodyTracking, true);
  assert.equal(parseSettings('{"bodyTracking":"true"}').bodyTracking, false);
});

test('v1 recipe upgrades to v2 with defaults; future versions throw', () => {
  const upgraded = normalizeCharacter({ version: 1, parts: { ears: 'round' } });
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.parts.ears, 'round');
  assert.equal(upgraded.face.nose.bridgeWidth, 1);
  assert.equal(upgraded.face.cheeks.fullness, 1);
  assert.equal(upgraded.face.chin.width, 1);
  assert.equal(upgraded.face.ears.size, 1);
  assert.equal(upgraded.body.height, 1);
  assert.equal(upgraded.body.shoulderWidth, 1);
  assert.equal(upgraded.body.waistWidth, 1);
  assert.equal(upgraded.body.hipWidth, 1);
  assert.throws(() => normalizeCharacter({ version: 3 }), /更新版本/);
});
