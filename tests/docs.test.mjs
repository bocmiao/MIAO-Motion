import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const markdownFiles = [
  ...readdirSync(root).filter((name) => name.endsWith('.md')).map((name) => resolve(root, name)),
  ...readdirSync(resolve(root, 'docs')).filter((name) => name.endsWith('.md')).map((name) => resolve(root, 'docs', name)),
];

test('local Markdown links resolve to repository files', () => {
  const missing = [];
  for (const file of markdownFiles) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\]\((?!https?:|mailto:)([^)#\s]+)(?:#[^)]+)?\)/g)) {
      const target = decodeURIComponent(match[1]);
      if (!existsSync(resolve(dirname(file), target))) missing.push(`${file.slice(root.length + 1)} → ${target}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('generated license bundle includes runtime dependencies and model license', () => {
  const licenses = readFileSync(resolve(root, 'public/licenses/THIRD_PARTY_LICENSES.txt'), 'utf8');
  for (const component of ['@mediapipe/tasks-vision', '@pixiv/three-vrm', 'three@', 'Google MediaPipe Face Landmarker model']) {
    assert.match(licenses, new RegExp(component.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
