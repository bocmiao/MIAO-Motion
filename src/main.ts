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
  DEFAULT_SETTINGS,
  cameraConstraints,
  cameraErrorMessage,
  createSettingsProfile,
  estimateModelPerformance,
  modelLoadErrorMessage,
  onboardingState,
  parseSettings,
  parseSettingsProfile,
  renderPixelRatio,
  sanitizeDiagnosticMessage,
  scaleMotion,
  trackingQuality,
  validateModelFile,
  type AppSettings,
  type Background,
  type ModelMetrics,
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
const renderQualitySelect = required<HTMLSelectElement>('#render-quality');
const backgroundButton = required<HTMLButtonElement>('#background-toggle');
const broadcastButton = required<HTMLButtonElement>('#broadcast-toggle');
const obsButton = required<HTMLButtonElement>('#copy-obs-url');
const diagnostics = required<HTMLElement>('#diagnostics');
const doctorSummary = required<HTMLElement>('#doctor-summary');
const exportSettingsButton = required<HTMLButtonElement>('#export-settings');
const importSettingsButton = required<HTMLButtonElement>('#import-settings');
const resetSettingsButton = required<HTMLButtonElement>('#reset-settings');
const removeModelButton = required<HTMLButtonElement>('#remove-model');
const exportDiagnosticsButton = required<HTMLButtonElement>('#export-diagnostics');
const settingsFileInput = required<HTMLInputElement>('#settings-file');
const openGuideButton = required<HTMLButtonElement>('#open-guide');
const onboardingDialog = required<HTMLDialogElement>('#onboarding-dialog');
const onboardingProgress = required<HTMLElement>('#onboarding-progress');
const onboardingProgressbar = required<HTMLElement>('#onboarding-progressbar');
const onboardingCloseButton = required<HTMLButtonElement>('#onboarding-close');
const onboardingLaterButton = required<HTMLButtonElement>('#onboarding-later');
const onboardingBackButton = required<HTMLButtonElement>('#onboarding-back');
const onboardingNextButton = required<HTMLButtonElement>('#onboarding-next');
const onboardingImportButton = required<HTMLButtonElement>('#onboarding-import');
const onboardingCameraButton = required<HTMLButtonElement>('#onboarding-camera');
const onboardingCalibrateButton = required<HTMLButtonElement>('#onboarding-calibrate');
const onboardingObsButton = required<HTMLButtonElement>('#onboarding-copy-obs');
const onboardingModelState = required<HTMLElement>('#onboarding-model-state');
const onboardingCameraState = required<HTMLElement>('#onboarding-camera-state');
const onboardingFinishState = required<HTMLElement>('#onboarding-finish-state');
const toast = required<HTMLElement>('#toast');
const onboardingPanels = [...document.querySelectorAll<HTMLElement>('[data-onboarding-panel]')];

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

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  modelStatus.textContent = '无法启动 3D 画面：请更新显卡驱动并在浏览器中启用硬件加速';
  modelStatus.dataset.kind = 'error';
  throw error;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(renderPixelRatio(settings.renderQuality, window.devicePixelRatio));
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
let onboardingStep = 0;
let modelCanAnimate = false;
let currentModelMetrics: ModelMetrics | null = null;
const diagnosticEvents: { at: string; kind: string; message: string }[] = [];
const clock = new THREE.Clock();
const faceMatrix = new THREE.Matrix4();
const faceQuaternion = new THREE.Quaternion();
const faceScale = new THREE.Vector3();
const facePosition = new THREE.Vector3();

const setModelStatus = (message: string, kind: 'normal' | 'error' = 'normal') => {
  modelStatus.textContent = message;
  modelStatus.dataset.kind = kind;
};

const addDiagnosticEvent = (kind: string, value: unknown) => {
  diagnosticEvents.push({ at: new Date().toISOString(), kind, message: sanitizeDiagnosticMessage(value).slice(0, 300) });
  if (diagnosticEvents.length > 80) diagnosticEvents.shift();
};

const downloadJson = (name: string, value: unknown) => {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
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

const updateOnboarding = () => {
  const state = onboardingState(onboardingStep, modelCanAnimate, Boolean(cameraStream));
  onboardingStep = state.current;
  onboardingPanels.forEach((panel) => { panel.hidden = Number(panel.dataset.onboardingPanel) !== onboardingStep; });
  onboardingProgress.textContent = `第 ${state.progress} 步`;
  onboardingProgressbar.setAttribute('aria-valuenow', String(onboardingStep + 1));
  const fill = onboardingProgressbar.firstElementChild as HTMLElement | null;
  if (fill) fill.style.width = `${(onboardingStep + 1) * 25}%`;
  onboardingBackButton.disabled = onboardingStep === 0;
  onboardingNextButton.disabled = !state.canContinue;
  onboardingNextButton.textContent = state.nextLabel;
  onboardingModelState.textContent = modelCanAnimate
    ? `${modelName.textContent} · 检查通过`
    : currentVrm ? `${modelName.textContent} · 缺少头部骨骼，需更换模型` : '尚未导入角色';
  onboardingCameraState.textContent = cameraStream ? '已开启 · 画面仅在本机处理' : cameraStatus.textContent ?? '尚未开启';
  onboardingCameraButton.textContent = cameraStream ? '关闭摄像头' : '开启摄像头';
  onboardingCalibrateButton.disabled = !modelCanAnimate || !cameraStream;
  onboardingObsButton.disabled = !modelCanAnimate;
};

const openOnboarding = () => {
  onboardingStep = 0;
  updateOnboarding();
  if (!onboardingDialog.open) onboardingDialog.showModal();
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
    if (stored) {
      await loadVrm(new File([stored.data], stored.name, { type: stored.type }), false);
      if (currentVrm) showToast('已恢复上次使用的角色和设置');
    }
  } catch (error) {
    console.warn('无法恢复上次模型', error);
    addDiagnosticEvent('model-restore-error', error);
  }
};

const deleteStoredModel = async () => {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('assets', 'readwrite');
    transaction.objectStore('assets').delete('current-vrm');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
};

const collectModelMetrics = (vrm: VRM, fileBytes: number): ModelMetrics => {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let triangles = 0;

  vrm.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const multiplier = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    const vertexCount = mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0;
    triangles += Math.round(vertexCount / 3) * multiplier;
    geometries.add(mesh.geometry);
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.filter(Boolean).forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if ((value as THREE.Texture | undefined)?.isTexture) textures.add(value as THREE.Texture);
      });
    });
  });

  let geometryBytes = 0;
  geometries.forEach((geometry) => {
    Object.values(geometry.attributes).forEach((attribute) => { geometryBytes += attribute.array.byteLength; });
    if (geometry.index) geometryBytes += geometry.index.array.byteLength;
  });

  let textureBytes = 0;
  let maxTextureSize = 0;
  textures.forEach((texture) => {
    const image = texture.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | undefined;
    const width = image?.naturalWidth ?? image?.width ?? 0;
    const height = image?.naturalHeight ?? image?.height ?? 0;
    maxTextureSize = Math.max(maxTextureSize, width, height);
    textureBytes += Math.round(width * height * 4 * 4 / 3);
  });

  return { fileBytes, triangles, materials: materials.size, textures: textures.size, maxTextureSize, textureBytes, geometryBytes };
};

const inspectModel = (vrm: VRM, fileBytes: number) => {
  const expressions = vrm.expressionManager;
  const hasHead = Boolean(vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head));
  const hasBlink = Boolean(expressions?.getExpression(VRMExpressionPresetName.Blink)
    || (expressions?.getExpression(VRMExpressionPresetName.BlinkLeft) && expressions?.getExpression(VRMExpressionPresetName.BlinkRight)));
  const hasMouth = Boolean(expressions?.getExpression(VRMExpressionPresetName.Aa));
  const hasLook = Boolean(vrm.lookAt || expressions?.getExpression(VRMExpressionPresetName.LookLeft));
  const metrics = collectModelMetrics(vrm, fileBytes);
  const performance = estimateModelPerformance(metrics);
  currentModelMetrics = metrics;
  const items = [
    ['头部骨骼', hasHead ? 'ok' : 'error', hasHead ? '头部转动可用' : '阻断：缺少 Head 骨骼，不能开始动捕'],
    ['眨眼表情', hasBlink ? 'ok' : 'warn', hasBlink ? '眨眼可用' : '提醒：头部和嘴型仍可使用'],
    ['嘴型表情', hasMouth ? 'ok' : 'warn', hasMouth ? '张嘴可用' : '提醒：头部和眨眼仍可使用'],
    ['视线控制', hasLook ? 'ok' : 'warn', hasLook ? '眼神可用' : '提醒：眼睛不会跟随视线'],
    ['三角面', metrics.triangles > 200_000 ? 'error' : metrics.triangles > 100_000 ? 'warn' : 'ok', `${metrics.triangles.toLocaleString('zh-CN')} 个三角面`],
    ['材质', metrics.materials > 60 ? 'error' : metrics.materials > 30 ? 'warn' : 'ok', `${metrics.materials} 个材质`],
    ['贴图', metrics.maxTextureSize > 4096 ? 'error' : metrics.maxTextureSize > 2048 ? 'warn' : 'ok', `${metrics.textures} 张 · 最大 ${metrics.maxTextureSize || '未知'} px`],
    ['显存估算', performance.level === 'heavy' ? 'error' : performance.level === 'warning' ? 'warn' : 'ok', `贴图约 ${performance.textureMegabytes} MB · 几何 ${(metrics.geometryBytes / 1024 / 1024).toFixed(1)} MB`],
  ] as const;
  diagnostics.innerHTML = items.map(([label, level, detail]) => `<li class="${level}"><span>${level === 'ok' ? '✓' : level === 'error' ? '×' : '!'}</span><div><strong>${label}</strong><small>${detail}</small></div></li>`).join('');
  diagnostics.hidden = false;
  doctorSummary.textContent = hasHead ? performance.label : '发现阻断问题';
  return { compatible: [hasHead, hasBlink, hasMouth, hasLook].filter(Boolean).length, canAnimate: hasHead, performance };
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
    modelName.textContent = file.name.replace(/\.vrm$/i, '');
    const report = inspectModel(vrm, file.size);
    modelCanAnimate = report.canAnimate;
    setModelStatus(`${report.canAnimate ? '模型可用' : '模型受限'} · 兼容性 ${report.compatible}/4 · ${report.performance.label} · ${(file.size / 1024 / 1024).toFixed(1)} MB`, report.canAnimate ? 'normal' : 'error');
    dropHint.hidden = true;
    calibrateButton.disabled = !cameraStream || !modelCanAnimate;
    broadcastButton.disabled = !modelCanAnimate;
    obsButton.disabled = !modelCanAnimate;
    removeModelButton.disabled = false;
    updateOnboarding();
    if (persist) void saveModel(file).catch((error) => {
      console.warn('无法保存模型', error);
      showToast('角色已加载，但浏览器空间不足，刷新后需要重新导入');
    });
  } catch (error) {
    console.error(error);
    addDiagnosticEvent('model-load-error', error);
    setModelStatus(modelLoadErrorMessage(error), 'error');
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
    addDiagnosticEvent('detector-gpu-fallback', gpuError);
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
    addDiagnosticEvent('detector-load-error', error);
    setTrackingState('error', '本地动捕资源加载失败，请重新启动；仍失败时重新解压或构建');
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
  updateOnboarding();
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
    calibrateButton.disabled = !modelCanAnimate;
    setTrackingState('ready', '请正对摄像头');
    const activeCameraId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? cameraSelect.value;
    if (activeCameraId) {
      settings = { ...settings, cameraId: activeCameraId };
      saveSettings();
    }
    await refreshCameras();
  } catch (error) {
    console.error(error);
    addDiagnosticEvent('camera-start-error', error);
    stream?.getTracks().forEach((track) => track.stop());
    stopCamera();
    if (stream && !detectorReady) {
      cameraStatus.textContent = '摄像头可用，但动捕引擎未能加载';
      setTrackingState('error', '本地动捕资源加载失败：请重新启动；仍失败时重新解压或构建');
    } else {
      cameraStatus.textContent = cameraErrorMessage(error);
    }
  } finally {
    cameraButton.disabled = false;
    cameraSelect.disabled = false;
    updateOnboarding();
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
  if (!currentVrm || !modelCanAnimate) return;
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
    onboardingFinishState.textContent = '还没有检测到人脸：请正对镜头，等状态显示“正在驱动角色”后再试。';
    showToast('请先正对摄像头，等状态变为“正在驱动角色”');
    return;
  }
  neutralHead.copy(latestHead);
  hasNeutral = true;
  onboardingFinishState.textContent = '正面校准完成。现在自然转头，确认角色方向是否一致。';
  showToast('校准完成，现在的姿势已设为正面');
};

const applyBackground = () => {
  stage.dataset.background = background;
  backgroundButton.textContent = background === 'studio' ? '背景：影棚' : background === 'green' ? '背景：绿幕' : '背景：透明';
};

const applySettingsToControls = (applySavedBackground = true) => {
  if (applySavedBackground) background = settings.background;
  sensitivityInput.value = String(settings.sensitivity);
  sensitivityValue.value = `${Math.round(settings.sensitivity * 100)}%`;
  renderQualitySelect.value = settings.renderQuality;
  cameraSelect.value = settings.cameraId;
  renderer.setPixelRatio(renderPixelRatio(settings.renderQuality, window.devicePixelRatio));
  applyBackground();
  resize();
};

const removeCurrentModel = async () => {
  await deleteStoredModel();
  if (currentVrm) {
    scene.remove(currentVrm.scene);
    VRMUtils.deepDispose(currentVrm.scene);
  }
  currentVrm = null;
  currentModelMetrics = null;
  modelCanAnimate = false;
  currentMotion = { ...EMPTY_MOTION };
  targetMotion = { ...EMPTY_MOTION };
  modelName.textContent = '角色预览';
  setModelStatus('本地模型已删除；原始 VRM 文件不会受到影响');
  doctorSummary.textContent = '导入后自动检查';
  diagnostics.hidden = true;
  diagnostics.replaceChildren();
  dropHint.hidden = false;
  calibrateButton.disabled = true;
  broadcastButton.disabled = true;
  obsButton.disabled = true;
  removeModelButton.disabled = true;
  updateOnboarding();
};

const exportDiagnosticReport = () => {
  const trackSettings = cameraStream?.getVideoTracks()[0]?.getSettings();
  let graphics: Record<string, unknown> = {};
  try {
    const gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    graphics = {
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '浏览器未提供',
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : '浏览器未提供',
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };
  } catch (error) {
    graphics = { error: sanitizeDiagnosticMessage(error) };
  }
  downloadJson(`miao-motion-diagnostics-${new Date().toISOString().slice(0, 10)}.json`, {
    generatedAt: new Date().toISOString(),
    privacy: '不包含摄像头画面、模型内容、文件路径或设备编号',
    environment: { userAgent: navigator.userAgent, language: navigator.language, online: navigator.onLine },
    graphics,
    settings: createSettingsProfile(settings).settings,
    model: currentModelMetrics,
    camera: trackSettings ? { active: true, width: trackSettings.width, height: trackSettings.height, frameRate: trackSettings.frameRate } : { active: false },
    tracking: { status: trackingStatus.textContent, faceVisible },
    recentEvents: diagnosticEvents,
  });
  showToast('诊断报告已下载，可在反馈问题时附上');
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

const copyObsUrl = async () => {
  const url = `${location.origin}${location.pathname}?broadcast=1&background=transparent`;
  try {
    await navigator.clipboard.writeText(url);
    onboardingFinishState.textContent = 'OBS 地址已复制。现在到 OBS 添加“浏览器”来源并粘贴。';
    showToast('OBS 地址已复制，添加“浏览器”来源后粘贴即可');
  } catch {
    onboardingFinishState.textContent = `无法自动复制，请手动复制：${url}`;
    showToast(url);
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
renderQualitySelect.addEventListener('change', () => {
  settings = { ...settings, renderQuality: renderQualitySelect.value as AppSettings['renderQuality'] };
  renderer.setPixelRatio(renderPixelRatio(settings.renderQuality, window.devicePixelRatio));
  resize();
  saveSettings();
  showToast(`画面质量已切换为${renderQualitySelect.selectedOptions[0]?.textContent ?? '新档位'}`);
});
exportSettingsButton.addEventListener('click', () => {
  downloadJson('miao-motion-settings.json', createSettingsProfile(settings));
  showToast('设置已导出；文件不包含模型和摄像头编号');
});
importSettingsButton.addEventListener('click', () => settingsFileInput.click());
settingsFileInput.addEventListener('change', async () => {
  const file = settingsFileInput.files?.[0];
  settingsFileInput.value = '';
  if (!file) return;
  if (file.size > 64 * 1024) {
    showToast('设置文件异常：文件不能超过 64 KB');
    return;
  }
  try {
    const profile = parseSettingsProfile(await file.text());
    if (!profile) {
      showToast('无法导入：这不是有效的 MIAO Motion 设置文件');
      return;
    }
    settings = { ...settings, ...profile };
    saveSettings();
    applySettingsToControls();
    showToast('设置已导入并应用');
  } catch (error) {
    addDiagnosticEvent('settings-import-error', error);
    showToast('设置文件读取失败，请重新选择');
  }
});
resetSettingsButton.addEventListener('click', () => {
  if (!window.confirm('恢复默认画面与动捕设置？已保存的模型不会删除。')) return;
  settings = { ...DEFAULT_SETTINGS, onboardingComplete: settings.onboardingComplete };
  saveSettings();
  applySettingsToControls();
  showToast('已恢复默认设置');
});
removeModelButton.addEventListener('click', () => {
  if (!window.confirm('删除浏览器中保存的模型副本？电脑上的原始 VRM 文件不会删除。')) return;
  void removeCurrentModel().then(() => showToast('本地模型副本已删除')).catch((error) => {
    addDiagnosticEvent('model-delete-error', error);
    showToast('删除失败，请稍后重试');
  });
});
exportDiagnosticsButton.addEventListener('click', exportDiagnosticReport);
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
obsButton.addEventListener('click', () => { void copyObsUrl(); });
openGuideButton.addEventListener('click', openOnboarding);
onboardingCloseButton.addEventListener('click', () => onboardingDialog.close());
onboardingLaterButton.addEventListener('click', () => onboardingDialog.close());
onboardingBackButton.addEventListener('click', () => {
  onboardingStep -= 1;
  updateOnboarding();
});
onboardingNextButton.addEventListener('click', () => {
  if (onboardingStep === 3) {
    settings = { ...settings, onboardingComplete: true };
    saveSettings();
    onboardingDialog.close();
    showToast('新手引导已完成，随时可以从右上角重新打开');
    return;
  }
  onboardingStep += 1;
  updateOnboarding();
});
onboardingImportButton.addEventListener('click', () => fileInput.click());
onboardingCameraButton.addEventListener('click', () => {
  if (cameraStream) stopCamera();
  else void startCamera();
});
onboardingCalibrateButton.addEventListener('click', calibrate);
onboardingObsButton.addEventListener('click', () => { void copyObsUrl(); });

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
applySettingsToControls(!requestedBackground);
setTrackingQuality();
updateOnboarding();
void refreshCameras();
navigator.mediaDevices?.addEventListener('devicechange', () => { void refreshCameras(); });

canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  addDiagnosticEvent('webgl-context-lost', '3D graphics context lost');
  stopCamera();
  setModelStatus('3D 画面已停止：显卡环境被重置，请下载诊断报告后刷新页面', 'error');
  setTrackingState('error', '3D 画面已停止，请刷新页面');
  showToast('3D 画面发生错误，请下载诊断报告后刷新页面');
});

window.addEventListener('error', (event) => { addDiagnosticEvent('unhandled-error', event.error ?? event.message); });
window.addEventListener('unhandledrejection', (event) => { addDiagnosticEvent('unhandled-rejection', event.reason); });
addDiagnosticEvent('app-start', `broadcast=${startsInBroadcastMode}`);

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
      addDiagnosticEvent('tracking-frame-error', error);
      stopCamera();
      cameraStatus.textContent = '动捕处理失败，摄像头已安全关闭';
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
    if (modelCanAnimate) void startCamera();
  } else if (!settings.onboardingComplete) {
    requestAnimationFrame(openOnboarding);
  }
});

window.addEventListener('beforeunload', () => {
  stopCamera();
  faceLandmarker?.close();
});
