import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('desktop, npm lock and Cargo package versions follow package.json', () => {
  const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  const { version } = JSON.parse(read('package.json'));
  assert.equal(JSON.parse(read('package-lock.json')).version, version);
  assert.equal(JSON.parse(read('src-tauri/tauri.conf.json')).version, '../package.json');
  assert.equal(read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)[1], version);
  assert.ok(read('src-tauri/Cargo.lock').replaceAll('\r\n', '\n').includes(`name = "miao-motion"\nversion = "${version}"`));
});
