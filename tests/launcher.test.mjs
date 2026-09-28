import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const launcher = readFileSync(new URL('../start-windows.bat', import.meta.url), 'utf8');

assert.match(launcher, /NODE_MAJOR/);
assert.match(launcher, /if %NODE_MAJOR% LSS 22/);
assert.match(launcher, /npm ci/);
assert.match(launcher, /Invoke-WebRequest[^\r\n]+127\.0\.0\.1:4173/);
assert.match(launcher, /AddSeconds\(30\)/);

console.log('Windows launcher contract checks passed');
