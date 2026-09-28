import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const asset = (name) => readFileSync(new URL(`../public/mediapipe/${name}`, import.meta.url));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

test('pinned offline MediaPipe assets are complete', () => {
assert.equal(sha256(asset('face_landmarker.task')), '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff');
for (const name of [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]) assert.ok(asset(name).byteLength > 100_000, `${name} is missing or incomplete`);
});

test('runtime source does not fetch third-party CDNs', () => {
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /storage\.googleapis\.com|cdn\.jsdelivr\.net/);
});

test('project-owned VRM fixtures are deterministic GLB and corrupt inputs', () => {
const minimal = readFileSync(new URL('./fixtures/minimal-avatar.vrm', import.meta.url));
const corrupt = readFileSync(new URL('./fixtures/corrupt-avatar.vrm', import.meta.url));
assert.equal(minimal.readUInt32LE(0), 0x46546c67);
assert.equal(minimal.readUInt32LE(4), 2);
assert.equal(minimal.readUInt32LE(8), minimal.length);
assert.doesNotMatch(corrupt.toString('utf8'), /^glTF/);
});
