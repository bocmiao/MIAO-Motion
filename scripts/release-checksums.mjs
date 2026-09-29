import { readdirSync, readFileSync, renameSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const directory = process.argv[2];
if (!directory) throw new Error('Provide a release asset directory');
for (const original of readdirSync(directory).filter(name => /\.(exe|zip)$/.test(name))) {
  // GitHub normalizes spaces in uploaded asset names. Normalize before hashing.
  const name = original.replace(/\s+/g, '.');
  if (name !== original) {
    if (existsSync(join(directory, name))) throw new Error('Asset filename collision: ' + name);
    renameSync(join(directory, original), join(directory, name));
    if (existsSync(join(directory, original + '.sha256'))) unlinkSync(join(directory, original + '.sha256'));
  }
  const digest = createHash('sha256').update(readFileSync(join(directory, name))).digest('hex');
  writeFileSync(join(directory, name + '.sha256'), digest + '  ' + name + '\n');
}
