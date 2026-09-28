import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

test('camera, model loads, and page exit have lifecycle guards', () => {
  assert.match(source, /let cameraStarting = false/);
  assert.match(source, /const generation = \+\+loadGeneration/);
  assert.match(source, /generation !== loadGeneration/);
  assert.match(source, /addEventListener\('pagehide', stopCamera\)/);
});

test('head return, look-at, and safe diagnostics are wired', () => {
  assert.match(source, /latestHead\.copy\(neutralHead\)/);
  assert.match(source, /currentVrm\.lookAt\.yaw = gaze\.yaw/);
  assert.match(source, /currentVrm\.lookAt\.pitch = gaze\.pitch/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
});

test('IndexedDB v2 stores Blob models and migrates legacy data', () => {
  assert.match(source, /indexedDB\.open\('miao-motion', 2\)/);
  assert.match(source, /createObjectStore\('models'/);
  assert.match(source, /new Blob\(\[value\.data\]/);
  assert.match(source, /data: file/);
  assert.doesNotMatch(source, /file\.arrayBuffer\(\)/);
});
