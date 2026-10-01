import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/storage.mjs', import.meta.url), 'utf8');

test('camera, model loads, and page exit have lifecycle guards', () => {
  assert.match(source, /let cameraStarting = false/);
  assert.match(source, /const generation = \+\+loadGeneration/);
  assert.match(source, /generation !== loadGeneration/);
  assert.match(source, /addEventListener\('pagehide', stopCamera\)/);
});

test('head return, look-at, and safe diagnostics are wired', () => {
  assert.match(source, /neutralHeadBySource\s*=\s*\{/);
  assert.match(source, /activeHeadSource\(\)/);
  assert.match(source, /currentVrm\.lookAt\.yaw = gaze\.yaw/);
  assert.match(source, /currentVrm\.lookAt\.pitch = gaze\.pitch/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
});

test('IndexedDB v4 stores Blob model libraries, profiles, and migrates legacy data', () => {
  assert.match(storage, /indexedDB\.open\(DATABASE_NAME, DATABASE_VERSION\)/);
  assert.match(storage, /DATABASE_VERSION = 4/);
  assert.match(storage, /createObjectStore\('models'/);
  assert.match(storage, /createObjectStore\('profiles'/);
  assert.match(storage, /new Blob\(\[value\.data\]/);
  assert.match(storage, /data: file/);
  assert.doesNotMatch(storage, /file\.arrayBuffer\(\)/);
});

test('safeRandomId degrades gracefully outside secure contexts', () => {
  assert.match(storage, /export function safeRandomId\(\)/);
  assert.match(storage, /Date\.now\(\)\.toString\(36\)/);
});
