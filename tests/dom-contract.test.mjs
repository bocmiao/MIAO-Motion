import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

for (const [, id] of source.matchAll(/required<[^>]+>\('#([^']+)'\)/g)) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `index.html is missing #${id}`);
}

assert.match(html, new RegExp(`MIAO Motion v${pkg.version.replaceAll('.', '\\.')}\\b`));
assert.match(html, /<html lang="zh-CN">/);
assert.match(html, /id="tracking-status"[^>]+aria-live="polite"/);
assert.match(html, /<dialog id="onboarding-dialog"/);
assert.equal([...html.matchAll(/data-onboarding-panel="[0-3]"/g)].length, 4);
assert.match(html, /https:\/\/vroid\.com\/en\/studio/);
assert.match(html, /id="open-guide"/);

console.log('DOM contract checks passed');
