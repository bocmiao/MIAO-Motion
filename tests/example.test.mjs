import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('bundled example matches the pinned original and retains its redistribution license', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/example-avatar.json', import.meta.url), 'utf8'));
  const data = readFileSync(new URL('../public/examples/pixiv-vrm1.vrm', import.meta.url));
  assert.equal(data.length, manifest.bytes);
  assert.equal(createHash('sha256').update(data).digest('hex'), manifest.sha256);
  const json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
  const meta = json.extensions.VRMC_vrm.meta;
  assert.equal(meta.allowRedistribution, true);
  assert.equal(meta.avatarPermission, 'everyone');
  assert.equal(meta.licenseUrl, manifest.license);
  assert.deepEqual(meta.authors, ['pixiv Inc.']);
  assert.equal(meta.allowAntisocialOrHateUsage, false);
  assert.equal(meta.otherLicenseUrl, undefined);
});
