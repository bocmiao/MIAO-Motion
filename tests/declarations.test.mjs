import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

for (const moduleName of ['app-utils', 'motion', 'avatar-utils', 'capture', 'broadcast', 'storage']) {
  test(`${moduleName} runtime exports match its TypeScript declarations`, async () => {
    const runtime = await import(`../src/${moduleName}.mjs`);
    const declaration = readFileSync(new URL(`../src/${moduleName}.d.mts`, import.meta.url), 'utf8');
    for (const name of Object.keys(runtime)) {
      assert.match(declaration, new RegExp(`(?:export (?:const|function) ${name}\\b|export \\{[^}]*\\b${name}\\b)`), `missing declaration for ${name}`);
    }
  });
}
