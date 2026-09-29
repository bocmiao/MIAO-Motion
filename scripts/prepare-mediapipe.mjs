import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/mediapipe');
const modelName = 'face_landmarker.task';
const defaultModelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const modelUrl = process.env.MIAO_FACE_MODEL_URL?.trim() || defaultModelUrl;
const localModelPath = process.env.MIAO_FACE_MODEL_PATH?.trim();
const modelSha256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const wasmFiles = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const verifyModel = (data) => {
  if (sha256(data) !== modelSha256) throw new Error(`Face Landmarker SHA-256 不匹配；期望 ${modelSha256}`);
  return data;
};

const downloadModel = async () => {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      console.log(`正在下载 Face Landmarker（第 ${attempt}/2 次）：${modelUrl}`);
      const response = await fetch(modelUrl, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return verifyModel(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      lastError = error;
      if (attempt < 2) console.warn(`下载失败，将重试：${error instanceof Error ? error.message : error}`);
    }
  }
  throw new Error(`无法下载 Face Landmarker。可设置 MIAO_FACE_MODEL_URL 使用镜像，或把已校验文件放到 ${modelPath}。原因：${lastError instanceof Error ? lastError.message : lastError}`);
};

await mkdir(output, { recursive: true });
await copyFile(resolve(root, 'node_modules/@mediapipe/tasks-vision/vision_bundle.js'), resolve(output, 'vision_bundle.js'));
await Promise.all(wasmFiles.map((name) => copyFile(
  resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm', name),
  resolve(output, name),
)));

const modelPath = resolve(output, modelName);
let model;
try { model = await readFile(modelPath); } catch { /* Download below. */ }
if (!model || sha256(model) !== modelSha256) {
  model = localModelPath ? verifyModel(await readFile(resolve(localModelPath))) : await downloadModel();
  const temporary = `${modelPath}.tmp`;
  await writeFile(temporary, model);
  await rename(temporary, modelPath);
}

console.log(`Prepared pinned MediaPipe assets in ${output}`);
