import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assetLabel } from '../scripts/release-asset-labels.mjs';

const assets = ['MIAO.Motion_0.3.1_x64-setup.exe', 'MIAO.Motion_0.3.1_x64-setup.exe.sha256', 'MIAO-Motion-portable.zip', 'MIAO-Motion-portable.zip.sha256'];

test('release assets tell beginners which file to download, keeping real file names visible', () => {
  assert.match(assetLabel(assets[0]), /^【推荐】安装版/);
  assert.ok(assetLabel(assets[0]).includes(assets[0]), 'installer label shows the downloaded file name');
  assert.match(assetLabel(assets[2]), /^免安装版/);
  assert.ok(assetLabel(assets[2]).includes(assets[2]));
  assert.match(assetLabel(assets[1]), /普通用户不用下载/);
  assert.match(assetLabel(assets[3]), /普通用户不用下载/);
  assert.equal(assetLabel('notes.txt'), 'notes.txt');
  for (const name of assets) assert.ok(!assetLabel(name).includes('#'), 'a # would split the gh path#label argument');
});

test('the CLI prints one path#label argument per asset for gh release create', () => {
  const directory = mkdtempSync(join(tmpdir(), 'miao-assets-'));
  try {
    for (const name of assets) writeFileSync(join(directory, name), 'x');
    const lines = execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/release-asset-labels.mjs', import.meta.url)), directory], { encoding: 'utf8' }).trim().split('\n');
    assert.equal(lines.length, assets.length);
    for (const line of lines) {
      const [path, label] = line.split('#');
      assert.ok(assets.some(name => path === join(directory, name)));
      assert.ok(label && label.length > 0);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
