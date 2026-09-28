import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, 'dist/.build-version'), `${manifest.version}\n`);
