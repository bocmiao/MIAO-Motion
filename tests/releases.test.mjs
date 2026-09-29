import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installedTag, isNewer, selectRelease, releasesUrl } from '../public/release-info.js';

const release = tag => ({ tag_name: tag, assets: ['MIAO.Motion_0.3.0_x64-setup.exe', 'MIAO-Motion-portable.zip'].flatMap(name => [name, `${name}.sha256`]).map(name => ({ name, size: 10, browser_download_url: `${releasesUrl}/download/${tag}/${name}` })) });
test('downloads select complete releases including betas without hardcoded versions', () => {
  assert.equal(selectRelease([release('v0.2.2-beta'), release('v0.3.0-beta')]).tag, 'v0.3.0-beta');
  const incomplete = release('v0.4.0-beta'); incomplete.assets.pop();
  assert.equal(selectRelease([incomplete, release('v0.3.0-beta')]).tag, 'v0.3.0-beta');
  assert.throws(() => selectRelease([{ ...release('v0.3.0-beta'), draft: true }]));
  assert.throws(() => selectRelease([{ ...release('v0.3.0-beta'), assets: [{ name: 'MIAO-Motion-portable.zip', browser_download_url: 'https://evil.example/setup.exe' }] }]));
  assert.equal(isNewer('v0.10.0-beta', '0.9.9'), true);
  assert.equal(isNewer('v0.2.2-beta', '0.3.0'), false);
});

test('a beta user is offered the stable release with the same number, never the reverse', () => {
  assert.equal(isNewer('v0.3.1', installedTag('0.3.1')), true);
  assert.equal(isNewer('v0.3.1-beta', installedTag('0.3.1')), false);
  assert.equal(isNewer('v0.3.1-beta', '0.3.1'), false);
  assert.equal(isNewer('v0.3.2-beta', installedTag('0.3.1')), true);
  assert.equal(installedTag('0.3.1-beta'), '0.3.1-beta');
  const stableAndBeta = [release('v0.3.1-beta'), release('v0.3.1')];
  assert.equal(selectRelease(stableAndBeta).tag, 'v0.3.1');
  assert.equal(selectRelease(stableAndBeta.reverse()).tag, 'v0.3.1');
});
