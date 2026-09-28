import './style.css';
import * as THREE from 'three';
import type { Category, FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  VRM,
  VRMExpressionPresetName,
  VRMHumanBoneName,
  VRMLoaderPlugin,
  VRMUtils,
} from '@pixiv/three-vrm';
import { damping, lerpMotion, solveExpressions } from './motion.mjs';
import {
  cameraConstraints,
  cameraErrorMessage,
  parseSettings,
  scaleMotion,
  trackingQuality,
  validateModelFile,
  type AppSettings,
  type Background,
} from './app-utils.mjs';

const WASM_URL = new URL('./mediapipe/', document.baseURI).href;
const MODEL_URL = new URL('./mediapipe/face_landmarker.task', document.baseURI).href;
const MAX_MODEL_SIZE = 200 * 1024 * 1024;
const SETTINGS_KEY = 'miao-motion-settings-v1';
const EMPTY_MOTION = {
  blinkLeft: 0,
  blinkRight: 0,
  aa: 0,
  oh: 0,
  happy: 0,
  lookUp: 0,
  lookDown: 0,
  lookLeft: 0,
  lookRight: 0,
};

type Motion = typeof EMPTY_MOTION;
type StoredModel = { name: string; type: string; data: ArrayBuffer };

const required = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`页面缺少必要元素：${selector}`);
  return element;
};

const stage = required<HTMLElement>('#stage');
const canvas = required<HTMLCanvasElement>('#avatar-canvas');
const dropHint = required<HTMLElement>('#drop-hint');
const fileInput = required<HTMLInputElement>('#model-file');
const importButton = required<HTMLButtonElement>('#import-model');
const modelName = required<HTMLElement>('#model-name');
const modelStatus = required<HTMLElement>('#model-status');
const cameraButton = required<HTMLButtonElement>('#camera-toggle');
const cameraStatus = required<HTMLElement>('#camera-status');
const cameraPreview = required<HTMLVideoElement>('#camera-preview');
const trackingStatus = required<HTMLElement>('#tracking-status');
const trackingDot = required<HTMLElement>('#tracking-dot');
const trackingMeter = required<HTMLMeterElement>('#tracking-quality');
const trackingQualityLabel = required<HTMLOutputElement>('#tracking-quality-label');
const calibrateButton = required<HTMLButtonElement>('#calibrate');
const cameraSelect = required<HTMLSelectElement>('#camera-select');
const sensitivityInput = required<HTMLInputElement>('#sensitivity');
const sensitivityValue = required<HTMLOutputElement>('#sensitivity-value');
const backgroundButton = required<HTMLButtonElement>('#background-toggle');
const broadcastButton = required<HTMLButtonElement>('#broadcast-toggle');
const obsButton = required<HTMLButtonElement>('#copy-obs-url');
const diagnostics = required<HTMLElement>('#diagnostics');
const toast = required<HTMLElement>('#toast');

const readSettings = () => {
  try { return parseSettings(localStorage.getItem(SETTINGS_KEY)); } catch { return parseSettings(null); }
};
let settings: AppSettings = readSettings();

const saveSettings = () => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Private contexts may block storage. */ }
};

const params = new URLSearchParams(location.search);
const startsInBroadcastMode = params.get('broadcast') === '1';
const requestedBackground = params.get('background');
let background: Background = requestedBackground === 'green' || requestedBackground === 'transparent'
  ? requestedBackground
  : settings.background;

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 1.35, 3.2);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.1, 0);
controls.enableDamping = true;
controls.maxDistance = 8;
controls.minDistance = 0.8;

scene.add(new THREE.HemisphereLight(0xffffff, 0x525b76, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
keyLight.position.set(2, 3, 2);
scene.add(keyLight);

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

let currentVrm: VRM | null = null;
let cameraStream: MediaStream | null = null;
let faceLandmarker: FaceLandmarker | null = null;
let detectorPromise: Promise<FaceLandmarker> | null = null;
let lastVideoTime = -1;
let lastInferenceAt = 0;
let lastDetectionAt = 0;
let faceVisible = false;
let currentMotion: Motion = { ...EMPTY_MOTION };
let targetMotion: Motion = { ...EMPTY_MOTION };
let neutralHead = new THREE.Euler(0, 0, 0, 'YXZ');
let latestHead = new THREE.Euler(0, 0, 0, 'YXZ');
let hasNeutral = false;
let headRest = new THREE.Quaternion();
let headTarget = new THREE.Quaternion();
let lastFpsAt = performance.now();
let detectedFrames = 0;
let toastTimer = 0;
const clock = new THREE.Clock();
const faceMatrix = new THREE.Matrix4();
const faceQuaternion = new THREE.Quaternion();
const faceScale = new THREE.Vector3();
const facePosition = new THREE.Vector3();

const setModelStatus = (message: string, kind: 'normal' | 'error' = 'normal') => {
  modelStatus.textContent = message;
  modelStatus.dataset.kind = kind;
};

const showToast = (message: string) => {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2600);
};

const setTrackingState = (state: 'idle' | 'loading' | 'ready' | 'active' | 'lost' | 'error', message: string) => {
  trackingStatus.textContent = message;
  trackingDot.dataset.state = state;
};

const setTrackingQuality = (fps = 0, visible = false) => {
  const quality = trackingQuality(fps, visible);
  trackingMeter.value = quality.value;
  trackingMeter.dataset.level = quality.level;
  trackingQualityLabel.value = quality.label;
};

const refreshCameras = async () => {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
    const selectedId = cameraSelect.value || settings.cameraId;
    cameraSelect.replaceChildren(new Option('系统默认摄像头', ''));
    cameras.forEach((device, index) => cameraSelect.add(new Option(device.label || `摄像头 ${index + 1}`, device.deviceId)));
    if (selectedId && cameras.some((device) => device.deviceId === selectedId)) {
      cameraSelect.value = selectedId;
    } else if (selectedId) {
      settings = { ...settings, cameraId: '' };
      saveSettings();
    }
  } catch (error) {
    console.warn('无法读取摄像头列表', error);
  }
};

const frameModel = (object: THREE.Object3D) => {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const height = Math.max(size.y, 0.5);
  controls.target.copy(center);
  camera.position.set(center.x, center.y + height * 0.05, center.z + height * 1.55);
  camera.near = Math.max(height / 100, 0.01);
  camera.far = Math.max(height * 100, 100);
  camera.updateProjectionMatrix();
  controls.update();
};

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('miao-motion', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('assets');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const saveModel = async (file: File) => {
  const db = await openDatabase();
  const value: StoredModel = { name: file.name, type: file.type, data: await file.arrayBuffer() };
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('assets', 'readwrite');
    transaction.objectStore('assets').put(value, 'current-vrm');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
};

const restoreModel = async () => {
  try {
    const db = await openDatabase();
    const stored = await new Promise<StoredModel | undefined>((resolve, reject) => {
      const request = db.transaction('assets').objectStore('assets').get('current-vrm');
      request.onsuccess = () => resolve(request.result as StoredModel | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (stored) await loadVrm(new File([stored.data], stored.name, { type: stored.type }), false);
  } catch (error) {
    console.warn('无法恢复上次模型', error);
  }
};

const inspectModel = (vrm: VRM) => {
  const expressions = vrm.expressionManager;
  const hasHead = Boolean(vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head));
  const hasBlink = Boolean(expressions?.getExpression(VRMExpressionPresetName.Blink)
    || (expressions?.getExpression(VRMExpressionPresetName.BlinkLeft) && expressions?.getExpression(VRMExpressionPresetName.BlinkRight)));
  const hasMouth = Boolean(expressions?.getExpression(VRMExpressionPresetName.Aa));
  const hasLook = Boolean(vrm.lookAt || expressions?.getExpression(VRMExpressionPresetName.LookLeft));
  const items = [
    ['头部骨骼', hasHead],
    ['眨眼表情', hasBlink],
    ['嘴型表情', hasMouth],
    ['视线控制', hasLook],
  ] as const;
  diagnostics.innerHTML = items.map(([label, ok]) => `<li class="${ok ? 'ok' : 'warn'}"><span>${ok ? '✓' : '!'}</span>${label}</li>`).join('');
  diagnostics.hidden = false;
  return items.filter(([, ok]) => ok).length;
};

const loadVrm = async (file: File, persist = true) => {
  const validationError = validateModelFile(file, MAX_MODEL_SIZE);
  if (validationError) {
    setModelStatus(validationError, 'error');
    return;
  }

  setModelStatus('正在本机读取模型…');
  const objectUrl = URL.createObjectURL(file);
  try {
    const gltf = await loader.loadAsync(objectUrl);
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error('文件中没有找到 VRM 数据');

    VRMUtils.rotateVRM0(vrm);
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    if (currentVrm) {
      scene.remove(currentVrm.scene);
      VRMUtils.deepDispose(currentVrm.scene);
    }

    currentVrm = vrm;
    scene.add(vrm.scene);
    frameModel(vrm.scene);
    headRest.copy(vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head)?.quaternion ?? new THREE.Quaternion());
    hasNeutral = false;
    const score = inspectModel(vrm);
    modelName.textContent = file.name.replace(/\.vrm$/i, '');
    setModelStatus(`模型可用 · 兼容性 ${score}/4`);
    dropHint.hidden = true;
    calibrateButton.disabled = !cameraStream;
    broadcastButton.disabled = false;
    obsButton.disabled = false;
    if (persist) void saveModel(file).catch((error) => {
      console.warn('无法保存模型', error);
      showToast('角色已加载，但浏览器空间不足，刷新后需要重新导入');
    });
  } catch (error) {
    console.error(error);
    setModelStatus('模型解析失败：请确认文件完整且为 VRM 0.x/1.0', 'error');
  } finally {
    URL.revokeObjectURL(objectUrl);
    fileInput.value = '';
  }
};

const createDetector = async () => {
  setTrackingState('loading', '正在加载动捕引擎（首次约数秒）');
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  };
  try {
    return await FaceLandmarker.createFromOptions(vision, options);
  } catch (gpuError) {
    console.warn('GPU 初始化失败，改用 CPU', gpuError);
    return FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
    });
  }
};

const ensureDetector = async () => {
  if (faceLandmarker) return faceLandmarker;
  detectorPromise ??= createDetector();
  try {
    faceLandmarker = await detectorPromise;
    setTrackingState('ready', '引擎已就绪 · 等待人脸');
    return faceLandmarker;
  } catch (error) {
    detectorPromise = null;
    setTrackingState('error', '动捕引擎加载失败，请检查网络后重试');
    throw error;
  }
};

const stopCamera = () => {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraPreview.srcObject = null;
  cameraPreview.hidden = true;
  cameraStatus.textContent = '尚未开启';
  cameraButton.textContent = '开启摄像头';
  calibrateButton.disabled = true;
  faceVisible = false;
  targetMotion = { ...EMPTY_MOTION };
  detectedFrames = 0;
  lastFpsAt = performance.now();
  setTrackingQuality();
  setTrackingState(faceLandmarker ? 'ready' : 'idle', faceLandmarker ? '引擎已就绪' : '等待开启摄像头');
};

const startCamera = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = location.protocol === 'file:' ? '请通过本地服务器打开程序' : '当前环境不支持摄像头';
    return;
  }

  cameraButton.disabled = true;
  cameraSelect.disabled = true;
  cameraStatus.textContent = '正在请求权限…';
  let stream: MediaStream | null = null;
  let detectorReady = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(cameraSelect.value));
    await ensureDetector();
    detectorReady = true;
    cameraStream = stream;
    cameraPreview.srcObject = stream;
    await cameraPreview.play();
    cameraPreview.hidden = document.body.classList.contains('broadcast-mode');
    cameraStatus.textContent = '已开启 · 画面不会上传';
    cameraButton.textContent = '关闭摄像头';
    calibrateButton.disabled = !currentVrm;
    setTrackingState('ready', '请正对摄像头');
    const activeCameraId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? cameraSelect.value;
    if (activeCameraId) {
      settings = { ...settings, cameraId: activeCameraId };
      saveSettings();
    }
    await refreshCameras();
  } catch (error) {
    console.error(error);
    stream?.getTracks().forEach((track) => track.stop());
    stopCamera();
    if (stream && !detectorReady) {
      cameraStatus.textContent = '摄像头可用，但动捕引擎未能加载';
      setTrackingState('error', '动捕引擎加载失败：请检查网络后重试');
    } else {
      cameraStatus.textContent = cameraErrorMessage(error);
    }
  } finally {
    cameraButton.disabled = false;
    cameraSelect.disabled = false;
  }
};

const readHeadEuler = (result: FaceLandmarkerResult) => {
  const matrix = result.facialTransformationMatrixes[0];
  if (!matrix || matrix.data.length !== 16) return null;
  faceMatrix.fromArray(matrix.data);
  faceMatrix.decompose(facePosition, faceQuaternion, faceScale);
  const source = new THREE.Euler().setFromQuaternion(faceQuaternion, 'YXZ');
  return new THREE.Euler(-source.x, -source.y, source.z, 'YXZ');
};

const processDetection = (result: FaceLandmarkerResult) => {
  const categories = result.faceBlendshapes[0]?.categories;
  const head = readHeadEuler(result);
  if (!categories || !head) {
    targetMotion = { ...EMPTY_MOTION };
    return;
  }

  latestHead.copy(head);
  if (!hasNeutral) {
    neutralHead.copy(head);
    hasNeutral = true;
  }
  targetMotion = scaleMotion(solveExpressions(categories as Category[]) as Motion, settings.sensitivity);
  lastDetectionAt = performance.now();
  detectedFrames += 1;
  if (!faceVisible) {
    faceVisible = true;
    lastFpsAt = performance.now();
    detectedFrames = 1;
    setTrackingState('active', '正在驱动角色');
  }
};

const setExpression = (name: string, value: number) => {
  const manager = currentVrm?.expressionManager;
  if (manager?.getExpression(name)) manager.setValue(name, value);
};

const applyMotion = (delta: number) => {
  if (!currentVrm) return;
  const alpha = damping(delta);
  currentMotion = lerpMotion(currentMotion, targetMotion, alpha) as Motion;

  const manager = currentVrm.expressionManager;
  if (manager) {
    const hasSeparateBlink = manager.getExpression(VRMExpressionPresetName.BlinkLeft)
      && manager.getExpression(VRMExpressionPresetName.BlinkRight);
    if (hasSeparateBlink) {
      setExpression(VRMExpressionPresetName.BlinkLeft, currentMotion.blinkLeft);
      setExpression(VRMExpressionPresetName.BlinkRight, currentMotion.blinkRight);
    } else {
      setExpression(VRMExpressionPresetName.Blink, (currentMotion.blinkLeft + currentMotion.blinkRight) / 2);
    }
    setExpression(VRMExpressionPresetName.Aa, currentMotion.aa);
    setExpression(VRMExpressionPresetName.Oh, currentMotion.oh);
    setExpression(VRMExpressionPresetName.Happy, currentMotion.happy * 0.65);
    setExpression(VRMExpressionPresetName.LookUp, currentMotion.lookUp);
    setExpression(VRMExpressionPresetName.LookDown, currentMotion.lookDown);
    setExpression(VRMExpressionPresetName.LookLeft, currentMotion.lookLeft);
    setExpression(VRMExpressionPresetName.LookRight, currentMotion.lookRight);
  }

  const head = currentVrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head);
  if (head && hasNeutral) {
    const offset = new THREE.Euler(
      THREE.MathUtils.clamp((latestHead.x - neutralHead.x) * settings.sensitivity, -0.65, 0.65),
      THREE.MathUtils.clamp((latestHead.y - neutralHead.y) * settings.sensitivity, -0.85, 0.85),
      THREE.MathUtils.clamp((latestHead.z - neutralHead.z) * settings.sensitivity, -0.5, 0.5),
      'YXZ',
    );
    headTarget.copy(headRest).multiply(new THREE.Quaternion().setFromEuler(offset));
    head.quaternion.slerp(headTarget, alpha);
  }
};

const calibrate = () => {
  if (!faceVisible) {
    showToast('请先正对摄像头，等状态变为“正在驱动角色”');
    return;
  }
  neutralHead.copy(latestHead);
  hasNeutral = true;
  showToast('校准完成，现在的姿势已设为正面');
};

const applyBackground = () => {
  stage.dataset.background = background;
  backgroundButton.textContent = background === 'studio' ? '背景：影棚' : background === 'green' ? '背景：绿幕' : '背景：透明';
};

let backgroundBeforeBroadcast: Background | null = null;
const enterBroadcast = () => {
  document.body.classList.add('broadcast-mode');
  cameraPreview.hidden = true;
  broadcastButton.textContent = '退出直播画面';
  if (background === 'studio') {
    backgroundBeforeBroadcast = background;
    background = 'transparent';
  }
  applyBackground();
};

const exitBroadcast = () => {
  document.body.classList.remove('broadcast-mode');
  cameraPreview.hidden = !cameraStream;
  broadcastButton.textContent = '进入直播画面';
  if (backgroundBeforeBroadcast) {
    background = backgroundBeforeBroadcast;
    backgroundBeforeBroadcast = null;
    applyBackground();
  }
};

importButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void loadVrm(file);
});
cameraButton.addEventListener('click', () => {
  if (cameraStream) stopCamera();
  else void startCamera();
});
cameraSelect.addEventListener('change', () => {
  settings = { ...settings, cameraId: cameraSelect.value };
  saveSettings();
  if (cameraStream) {
    stopCamera();
    void startCamera();
  }
});
sensitivityInput.addEventListener('input', () => {
  settings = { ...settings, sensitivity: Number(sensitivityInput.value) };
  sensitivityValue.value = `${Math.round(settings.sensitivity * 100)}%`;
  saveSettings();
});
calibrateButton.addEventListener('click', calibrate);
backgroundButton.addEventListener('click', () => {
  background = background === 'studio' ? 'green' : background === 'green' ? 'transparent' : 'studio';
  settings = { ...settings, background };
  saveSettings();
  applyBackground();
});
broadcastButton.addEventListener('click', () => {
  if (document.body.classList.contains('broadcast-mode')) exitBroadcast();
  else enterBroadcast();
});
obsButton.addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?broadcast=1&background=transparent`;
  try {
    await navigator.clipboard.writeText(url);
    showToast('OBS 地址已复制，添加“浏览器”来源后粘贴即可');
  } catch {
    showToast(url);
  }
});

for (const eventName of ['dragenter', 'dragover']) {
  stage.addEventListener(eventName, (event) => {
    event.preventDefault();
    stage.classList.add('stage--dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  stage.addEventListener(eventName, (event) => {
    event.preventDefault();
    stage.classList.remove('stage--dragging');
  });
}
stage.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files[0];
  if (file) void loadVrm(file);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('broadcast-mode')) exitBroadcast();
});
stage.addEventListener('dblclick', () => {
  if (document.body.classList.contains('broadcast-mode')) exitBroadcast();
});

const resize = () => {
  const width = Math.max(stage.clientWidth, 1);
  const height = Math.max(stage.clientHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};
new ResizeObserver(resize).observe(stage);
resize();
sensitivityInput.value = String(settings.sensitivity);
sensitivityValue.value = `${Math.round(settings.sensitivity * 100)}%`;
setTrackingQuality();
applyBackground();
void refreshCameras();
navigator.mediaDevices?.addEventListener('devicechange', () => { void refreshCameras(); });

const animate = () => {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();
  if (faceLandmarker && cameraStream && cameraPreview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && cameraPreview.currentTime !== lastVideoTime && now - lastInferenceAt >= 25) {
    lastVideoTime = cameraPreview.currentTime;
    lastInferenceAt = now;
    try {
      processDetection(faceLandmarker.detectForVideo(cameraPreview, now));
    } catch (error) {
      console.error('动捕帧处理失败', error);
      setTrackingState('error', '动捕发生错误，请重启摄像头');
    }
  }
  if (faceVisible && now - lastDetectionAt > 500) {
    faceVisible = false;
    targetMotion = { ...EMPTY_MOTION };
    detectedFrames = 0;
    lastFpsAt = now;
    setTrackingQuality();
    setTrackingState('lost', '未检测到人脸');
  }
  if (now - lastFpsAt >= 1000 && faceVisible) {
    const fps = Math.round(detectedFrames * 1000 / (now - lastFpsAt));
    const quality = trackingQuality(fps, true);
    setTrackingQuality(fps, true);
    setTrackingState('active', `正在驱动角色 · ${fps} FPS · ${quality.label}`);
    detectedFrames = 0;
    lastFpsAt = now;
  }
  applyMotion(delta);
  currentVrm?.update(delta);
  controls.update();
  renderer.render(scene, camera);
};
animate();

void restoreModel().finally(() => {
  if (startsInBroadcastMode) {
    enterBroadcast();
    void startCamera();
  }
});

window.addEventListener('beforeunload', () => {
  stopCamera();
  faceLandmarker?.close();
});
