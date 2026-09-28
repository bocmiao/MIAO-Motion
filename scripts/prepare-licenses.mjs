import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/licenses');
const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
const packages = Object.entries(lock.packages ?? {})
  .filter(([path, value]) => path.startsWith('node_modules/') && value.dev !== true)
  .map(([path]) => path)
  .sort();

const fallback = {
  'Apache-2.0': resolve(root, 'node_modules/typescript/LICENSE.txt'),
  MIT: resolve(root, 'node_modules/three/LICENSE'),
};

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const sections = [];
for (const path of packages) {
  const directory = resolve(root, path);
  const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  const files = await readdir(directory);
  const licenseFile = files.find((name) => /^(license|copying|notice)(\.|$)/i.test(name));
  const fallbackPath = fallback[manifest.license];
  const licenseText = licenseFile
    ? await readFile(resolve(directory, licenseFile), 'utf8')
    : fallbackPath ? await readFile(fallbackPath, 'utf8') : `License identifier: ${manifest.license ?? 'UNKNOWN'}\n`;
  sections.push(`===== ${manifest.name}@${manifest.version} (${manifest.license ?? 'UNKNOWN'}) =====\n${licenseText.trim()}\n`);
}

sections.push(`===== Google MediaPipe Face Landmarker model (Apache-2.0) =====\nSHA-256: 64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff\n${(await readFile(fallback['Apache-2.0'], 'utf8')).trim()}\n`);
sections.push('===== Google MediaPipe Pose / Hand Landmarker models (Apache-2.0) =====\n' + (await readFile(fallback['Apache-2.0'], 'utf8')));
sections.push('===== Softcam and Microsoft DirectShow Base Classes (MIT) =====\n' + (await readFile(resolve(root, 'native/softcam/LICENSE'), 'utf8')));
await writeFile(resolve(output, 'THIRD_PARTY_LICENSES.txt'), `${sections.join('\n')}\n`);
await cp(resolve(root, 'LICENSE'), resolve(output, 'LICENSE-MPL-2.0.txt'));
await cp(resolve(root, 'THIRD_PARTY_NOTICES.md'), resolve(output, 'THIRD_PARTY_NOTICES.md'));
console.log(`Prepared ${packages.length} runtime license entries in ${output}`);
