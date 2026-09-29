import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
test('Rust license bundle follows the current lock and is copied to offline distribution', () => {
  const source=readFileSync('native/licenses/RUST_THIRD_PARTY_LICENSES.txt','utf8').replaceAll('\r\n','\n');
  const lock=readFileSync('src-tauri/Cargo.lock','utf8').replaceAll('\r\n','\n');
  assert.ok(source.includes('Cargo.lock SHA-256: '+createHash('sha256').update(lock).digest('hex')));
  for (const name of ['tauri','wry','webview2-com','windows','serde','tokio','selectors']) assert.ok(source.includes('===== '+name+'@'));
  assert.equal(readFileSync('public/licenses/RUST_THIRD_PARTY_LICENSES.txt','utf8').replaceAll('\r\n','\n'),source);
});
