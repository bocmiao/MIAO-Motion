import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/mediapipe');
const modelName = 'face_landmarker.task';
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const modelSha256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const wasmFiles = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

await mkdir(output, { recursive: true });
await Promise.all(wasmFiles.map((name) => copyFile(
  resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm', name),
  resolve(output, name),
)));

const modelPath = resolve(output, modelName);
let model;
try { model = await readFile(modelPath); } catch { /* Download below. */ }
if (!model || sha256(model) !== modelSha256) {
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`Face Landmarker download failed: HTTP ${response.status}`);
  model = Buffer.from(await response.arrayBuffer());
  if (sha256(model) !== modelSha256) throw new Error('Face Landmarker SHA-256 mismatch');
  const temporary = `${modelPath}.tmp`;
  await writeFile(temporary, model);
  await rename(temporary, modelPath);
}

console.log(`Prepared pinned MediaPipe assets in ${output}`);
