import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
test('published names and standard checksum filenames agree after GitHub normalization', () => {
  const directory = mkdtempSync(join(tmpdir(), 'miao-checksum-'));
  try {
    writeFileSync(join(directory,'MIAO Motion_0.3.0_x64-setup.exe'),'test installer');
    execFileSync(process.execPath,['scripts/release-checksums.mjs',directory]);
    const name='MIAO.Motion_0.3.0_x64-setup.exe';
    assert.ok(existsSync(join(directory,name)));
    assert.equal(readFileSync(join(directory,name+'.sha256'),'utf8'),createHash('sha256').update(readFileSync(join(directory,name))).digest('hex')+'  '+name+'\n');
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
