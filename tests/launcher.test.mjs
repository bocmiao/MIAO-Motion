import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const launcher = readFileSync(new URL('../start-windows.bat', import.meta.url), 'utf8');

test('source launcher is safe, cached, localized, and CRLF encoded', () => {
  assert.match(launcher, /NODE_MAJOR/);
  assert.match(launcher, /if %NODE_MAJOR% LSS 22/);
  assert.match(launcher, /npm ci/);
  assert.match(launcher, /Invoke-WebRequest[^\r\n]+127\.0\.0\.1:4173/);
  assert.match(launcher, /AddSeconds\(30\)/);
  assert.match(launcher, /scripts\\lock-hash\.mjs/);
  assert.doesNotMatch(launcher, /(?<!\r)\n/, 'start-windows.bat must use CRLF');
});

test('portable launcher is Node-free and validates its build', () => {
  const portable = readFileSync(new URL('../start-portable.bat', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../portable-server.ps1', import.meta.url), 'utf8');
  assert.doesNotMatch(portable, /node|npm/i);
  assert.match(portable, /dist\\index\.html/);
  assert.match(server, /HttpListener/);
  assert.match(server, /StartsWith\(\$rootBoundary/);
  assert.match(server, /\[switch\]\$NoBrowser/);
  assert.match(server, /if \(-not \$NoBrowser\) \{ Start-Process \$prefix \}/);
});
