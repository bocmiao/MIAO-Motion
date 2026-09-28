import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(resolve(root, 'public/example-avatar.json'), 'utf8'));
const output = resolve(root, 'public/examples/pixiv-vrm1.vrm');
const valid = data => data.length === config.bytes && createHash('sha256').update(data).digest('hex') === config.sha256;
let data;
try { data = await readFile(output); } catch { /* Prepare below. */ }
if (!data || !valid(data)) {
  if (process.env.MIAO_EXAMPLE_MODEL_PATH) data = await readFile(process.env.MIAO_EXAMPLE_MODEL_PATH);
  else {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(process.env.MIAO_EXAMPLE_MODEL_URL || config.source, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = Buffer.from(await response.arrayBuffer());
        break;
      } catch (error) {
        if (attempt === 2) throw new Error(`示例角色准备失败：${error.message}。可用 MIAO_EXAMPLE_MODEL_PATH 指定已下载的原始文件，仍需通过校验。`);
      }
    }
  }
  if (!data || !valid(data)) throw new Error('示例角色 SHA-256 或长度不匹配，拒绝打包。');
  // Preserve original bytes and metadata; the avatar is not relicensed as MPL.
  await mkdir(resolve(root, 'public/examples'), { recursive: true });
  await writeFile(`${output}.tmp`, data);
  await rename(`${output}.tmp`, output);
}
console.log('已准备离线 pixiv 示例角色（独立 VRM 公共许可，不是喵动原创）');
