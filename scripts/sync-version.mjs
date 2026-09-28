// package.json is authoritative; npm version updates npm's lockfile automatically.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error('Invalid release version');
for (const [path, pattern] of [
  ['src-tauri/Cargo.toml', /^(version = ")[^"]+("$)/m],
  ['src-tauri/Cargo.lock', /(name = "miao-motion"\nversion = ")[^"]+("\n)/],
]) {
  const url = new URL(path, root);
  const source = readFileSync(url, 'utf8');
  if (!pattern.test(source)) throw new Error(`Missing package version in ${path}`);
  writeFileSync(url, source.replace(pattern, (_, prefix, suffix) => `${prefix}${version}${suffix}`));
}
