import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const metadata = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : JSON.parse(execFileSync('cargo', [
  'metadata', '--locked', '--format-version', '1', '--filter-platform', 'x86_64-pc-windows-msvc', '--manifest-path', 'src-tauri/Cargo.toml',
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
const ids = new Set(metadata.resolve.nodes.map(node => node.id));
const packages = metadata.packages.filter(p => p.source && ids.has(p.id)).sort((a,b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const digest = createHash('sha256').update(readFileSync('src-tauri/Cargo.lock', 'utf8').replaceAll('\r\n', '\n')).digest('hex');
const sections = ['Rust dependencies for Windows desktop (including build-time dependencies).', 'Cargo.lock SHA-256: ' + digest];
for (const p of packages) {
  const root = dirname(p.manifest_path);
  const names = readdirSync(root, { withFileTypes: true }).filter(f => f.isFile() && /^(licen[cs]e|copying|notice|copyright)([.\-_]|$)/i.test(f.name)).map(f => f.name);
  if (p.license_file && !names.includes(p.license_file)) names.push(p.license_file);
  const upstream = !names.length ? readdirSync('native/licenses/upstream').filter(n => n.startsWith(p.name + '-LICENSE')) : [];
  if (!names.length && !upstream.length) throw new Error('Missing license text: ' + p.name + '@' + p.version);
  sections.push('===== ' + p.name + '@' + p.version + ' (' + (p.license ?? 'see license file') + ') =====\n' +
    [...names.map(n => n + '\n' + readFileSync(join(root, n), 'utf8')), ...upstream.map(n => readFileSync(join('native/licenses/upstream', n), 'utf8'))].join('\n'));
}
mkdirSync('native/licenses', { recursive: true });
writeFileSync('native/licenses/RUST_THIRD_PARTY_LICENSES.txt', sections.join('\n\n') + '\n');
console.log('Collected exact license files for ' + packages.length + ' Rust packages.');
