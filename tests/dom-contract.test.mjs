import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('every required runtime element exists', () => {
for (const [, id] of source.matchAll(/required<[^>]+>\('#([^']+)'\)/g)) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `index.html is missing #${id}`);
}
});

test('document exposes onboarding, accessibility, privacy, and data controls', () => {
assert.match(html, /MIAO Motion v%MIAO_VERSION%/);
assert.match(html, /<html lang="zh-CN">/);
assert.match(html, /id="tracking-status"[^>]+aria-live="polite"/);
assert.match(html, /<dialog id="onboarding-dialog"/);
assert.equal([...html.matchAll(/data-onboarding-panel="[0-3]"/g)].length, 4);
assert.match(html, /https:\/\/store\.steampowered\.com\/app\/1486350\/VRoid_Studio\/\?l=schinese/);
assert.match(html, /id="open-guide"/);
assert.match(html, /id="render-quality"/);
assert.match(html, /id="export-settings"/);
assert.match(html, /id="import-settings"/);
assert.match(html, /id="remove-model"/);
assert.match(html, /id="export-diagnostics"/);
assert.match(html, /Content-Security-Policy/);
assert.match(html, /id="tracking-quality"[^>]+aria-label=/);
});
