// Prints one "path#display label" line per release asset for `gh release create`. File names stay
// unchanged (the download page and checksum files match them); the label only changes how the
// GitHub Assets list reads, so a beginner can tell which file to take.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @param {string} name */
export function assetLabel(name) {
  if (/_x64-setup\.exe$/.test(name)) return `【推荐】安装版：双击安装，功能最全（${name}）`;
  if (name === 'MIAO-Motion-portable.zip') return `免安装版：电脑不能装软件时用，解压后双击启动（${name}）`;
  if (/_x64-setup\.exe\.sha256$/.test(name)) return '安装版的校验文件（普通用户不用下载）';
  if (/\.zip\.sha256$/.test(name)) return '免安装版的校验文件（普通用户不用下载）';
  return name;
}

/** @param {string} directory */
export function labelledAssets(directory) {
  return readdirSync(directory).sort().map(name => `${join(directory, name)}#${assetLabel(name)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  if (!directory) throw new Error('用法：node scripts/release-asset-labels.mjs <附件目录>');
  for (const line of labelledAssets(directory)) console.log(line);
}
