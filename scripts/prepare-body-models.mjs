import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
const models = [
  ['pose_landmarker_lite', 'pose_landmarker/pose_landmarker_lite', '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'],
  ['hand_landmarker', 'hand_landmarker/hand_landmarker', 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1'],
];
await mkdir('public/mediapipe', { recursive: true });
for (const [name, path, hash] of models) {
  const output = `public/mediapipe/${name}.task`;
  const valid = data => createHash('sha256').update(data).digest('hex') === hash;
  try { if (valid(await readFile(output))) continue; } catch {}
  const base = process.env.MIAO_BODY_MODEL_BASE_URL || 'https://storage.googleapis.com/mediapipe-models';
  const response = await fetch(`${base}/${path}/float16/1/${name}.task`, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`身体/手部模型下载失败：HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (!valid(data)) throw new Error(`${name} 校验不符，拒绝打包`);
  await writeFile(`${output}.tmp`, data); await rename(`${output}.tmp`, output);
}
