import './style.css';
import { setupNativeCamera } from './native-camera';
import { setupPhone } from './phone';
import { setupBodyTracking } from './body-tracking';
import { configureObs } from './obs';
import { setupStudioTools } from './studio-tools';
import { prepareAvatarFrame } from './render-ready';
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
import { applyNaturalPose, frameAvatar, vrmRotation, collectModelMetrics, gazeAngles, idleBlink, mirrorMotion, relativeHeadRotation } from './avatar-utils.mjs';
import {
  DEFAULT_SETTINGS,
  coarseUserAgent,
  createSettingsProfile,
  estimateModelPerformance,
  modelLoadErrorMessage,
  onboardingState,
  parseDiagnosticEvents,
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
import { cameraConstraints, cameraErrorMessage, createWithGpuFallback, stopMediaStream } from './capture.mjs';
import { broadcastBackground, obsBrowserSourceUrl, restoreBroadcastBackground } from './broadcast.mjs';
import {
  deleteStoredModel,
  deleteStoredProfile,
  getStoredModel,
  listStoredModels,
  listStoredProfiles,
  putStoredModel,
  putStoredProfile,
  updateStoredModel,
  type StoredModel,
  type StoredProfile,
} from './storage.mjs';

const WASM_URL = new URL('./mediapipe/', document.baseURI).href;
const MODEL_URL = new URL('./mediapipe/face_landmarker.task', document.baseURI).href;
const MAX_MODEL_SIZE = 200 * 1024 * 1024;
const SETTINGS_KEY = 'miao-motion-settings-v1';
const DIAGNOSTICS_KEY = 'miao-motion-diagnostics-v1';
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
const retry3dButton = required<HTMLButtonElement>('#retry-3d');
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
const smoothingInput = required<HTMLInputElement>('#smoothing');
const smoothingValue = required<HTMLOutputElement>('#smoothing-value');
const renderQualitySelect = required<HTMLSelectElement>('#render-quality');
const outputAspectSelect = required<HTMLSelectElement>('#output-aspect');
const mirrorInput = required<HTMLInputElement>('#mirror-motion');
const modelLibrary = required<HTMLSelectElement>('#model-library');
const loadModelButton = required<HTMLButtonElement>('#load-library-model');
const desktopRuntime = location.hostname === 'tauri.localhost' || location.protocol === 'tauri:';
const modelThumbnail = required<HTMLImageElement>('#model-thumbnail');
const renameModelButton = required<HTMLButtonElement>('#rename-model');
const deleteLibraryModelButton = required<HTMLButtonElement>('#delete-library-model');
const profileNameInput = required<HTMLInputElement>('#profile-name');
const profileLibrary = required<HTMLSelectElement>('#profile-library');
const saveProfileButton = required<HTMLButtonElement>('#save-profile');
const applyProfileButton = required<HTMLButtonElement>('#apply-profile');
const deleteProfileButton = required<HTMLButtonElement>('#delete-profile');
const backgroundButton = required<HTMLButtonElement>('#background-toggle');
const broadcastButton = required<HTMLButtonElement>('#broadcast-toggle');
const obsButton = required<HTMLButtonElement>('#copy-obs-url');
const diagnostics = required<HTMLElement>('#diagnostics');
const doctorSummary = required<HTMLElement>('#doctor-summary');
const runPreflightButton = required<HTMLButtonElement>('#run-preflight');
const preflightResults = required<HTMLUListElement>('#preflight-results');
const exportSettingsButton = required<HTMLButtonElement>('#export-settings');
const importSettingsButton = required<HTMLButtonElement>('#import-settings');
const resetSettingsButton = required<HTMLButtonElement>('#reset-settings');
const removeModelButton = required<HTMLButtonElement>('#remove-model');
const exportDiagnosticsButton = required<HTMLButtonElement>('#export-diagnostics');
const viewDiagnosticsButton = required<HTMLButtonElement>('#view-diagnostics');
const clearDiagnosticsButton = required<HTMLButtonElement>('#clear-diagnostics');
const diagnosticsDialog = required<HTMLDialogElement>('#diagnostics-dialog');
const diagnosticsLog = required<HTMLOListElement>('#diagnostics-log');
const closeDiagnosticsButton = required<HTMLButtonElement>('#close-diagnostics');
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
const onboardingBroadcastButton = required<HTMLButtonElement>('#onboarding-enter-broadcast');
const onboardingModelState = required<HTMLElement>('#onboarding-model-state');
const onboardingCameraState = required<HTMLElement>('#onboarding-camera-state');
const onboardingFinishState = required<HTMLElement>('#onboarding-finish-state');
const broadcastStatus = required<HTMLElement>('#broadcast-status');
const broadcastStatusTitle = required<HTMLElement>('#broadcast-status-title');
const broadcastStatusDetail = required<HTMLElement>('#broadcast-status-detail');
const broadcastImportButton = required<HTMLButtonElement>('#broadcast-import');
const toast = required<HTMLElement>('#toast');
const onboardingPanels = [...document.querySelectorAll<HTMLElement>('[data-onboarding-panel]')];
const viewPresetButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-view]')];

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
retry3dButton.addEventListener('click', () => location.reload());
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  modelStatus.textContent = '无法启动 3D 画面：请更新显卡驱动并在浏览器中启用硬件加速';
  modelStatus.dataset.kind = 'error';
  retry3dButton.hidden = false;
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
let neutralHead = new THREE.Quaternion();
let latestHead = new THREE.Quaternion();
let hasNeutral = false;
let headRest = new THREE.Quaternion();
let headTarget = new THREE.Quaternion();
let chestRest = new THREE.Quaternion();
let chestTarget = new THREE.Quaternion();
let lastFpsAt = performance.now();
let detectedFrames = 0;
let toastTimer = 0;
let onboardingStep = 0;
let modelCanAnimate = false;
let modelPreparing = false;
let currentModelMetrics: ModelMetrics | null = null;
let currentModelMeta: Record<string, unknown> | null = null;
let cameraStarting = false;
let loadGeneration = 0;
let diagnosticEvents = (() => {
  try { return parseDiagnosticEvents(localStorage.getItem(DIAGNOSTICS_KEY)); } catch { return []; }
})();
let currentModelId = settings.activeModelId;
let storedModels: StoredModel[] = [];
let storedProfiles: StoredProfile[] = [];
let thumbnailPendingId = '';
const clock = new THREE.Clock();
const bodyTracking = setupBodyTracking(() => currentVrm, () => settings.mirror);
const studio = setupStudioTools(renderer, () => currentVrm, () => currentModelId, message => showToast(message), () => updateBroadcastStatus());
const nativeCamera = setupNativeCamera(canvas, () => Boolean(currentVrm) && stage.dataset.renderReady === 'true');
let lastPhoneFrame = 0;
const phone = setupPhone(packet => {
  lastPhoneFrame = performance.now();
  latestHead.copy(packet.head);
  if (!hasNeutral) { neutralHead.copy(latestHead); hasNeutral = true; }
  targetMotion = scaleMotion(mirrorMotion(solveExpressions(packet.categories) as Motion, settings.mirror), settings.sensitivity);
  lastDetectionAt = lastPhoneFrame; faceVisible = true; detectedFrames++;
  setTrackingState('active', '正在使用手机面捕');
});
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
  try { localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(diagnosticEvents)); } catch { /* Private contexts may block storage. */ }
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

const updateBroadcastStatus = () => {
  if (!document.body.classList.contains('broadcast-mode')) {
    broadcastStatus.hidden = true;
    return;
  }
  if (modelPreparing) {
    broadcastStatusTitle.textContent = '正在准备画面…';
    broadcastStatusDetail.textContent = '首次显示角色可能需要几秒，请稍候。';
    broadcastImportButton.hidden = true;
    broadcastStatus.hidden = false;
    return;
  }
  if (!modelCanAnimate) {
    broadcastStatusTitle.textContent = currentVrm ? '当前模型不能开始动捕' : '还没有可用角色';
    broadcastStatusDetail.textContent = currentVrm ? '模型缺少头部骨骼，请选择其他 VRM。' : '在 OBS“交互”窗口中点击这里，选择一个 VRM 文件。';
    broadcastImportButton.hidden = false;
    broadcastStatus.hidden = false;
    return;
  }
  if (!cameraStream && !studio.microphoneActive() && !(lastPhoneFrame > 0 && performance.now() - lastPhoneFrame < 500)) {
    broadcastStatusTitle.textContent = cameraStarting ? '正在开启摄像头' : '摄像头尚未就绪';
    broadcastStatusDetail.textContent = cameraStarting ? '请完成权限确认。' : cameraStatus.textContent ?? '请退出直播画面并检查摄像头。';
    broadcastImportButton.hidden = true;
    broadcastStatus.hidden = false;
    return;
  }
  broadcastStatus.hidden = trackingDot.dataset.state !== 'error';
  if (!broadcastStatus.hidden) {
    broadcastStatusTitle.textContent = '动捕发生错误';
    broadcastStatusDetail.textContent = trackingStatus.textContent ?? '请重新开启摄像头。';
    broadcastImportButton.hidden = true;
  }
};

const setTrackingState = (state: 'idle' | 'loading' | 'ready' | 'active' | 'lost' | 'error', message: string) => {
  trackingStatus.textContent = message;
  trackingDot.dataset.state = state;
  updateBroadcastStatus();
};

const updateOnboarding = () => {
  const state = onboardingState(onboardingStep, modelCanAnimate, Boolean(cameraStream));
  onboardingStep = state.current;
  onboardingPanels.forEach((panel) => { panel.hidden = Number(panel.dataset.onboardingPanel) !== onboardingStep; });
  onboardingProgress.textContent = `第 ${state.progress} 步`;
  onboardingProgressbar.setAttribute('aria-valuenow', String(onboardingStep + 1));
  onboardingProgressbar.dataset.step = String(onboardingStep + 1);
  onboardingBackButton.disabled = onboardingStep === 0;
  onboardingNextButton.disabled = !state.canContinue;
  onboardingNextButton.textContent = state.nextLabel;
  onboardingModelState.textContent = modelCanAnimate
    ? `${modelName.textContent} · 检查通过`
    : currentVrm ? `${modelName.textContent} · 缺少头部骨骼，需更换模型` : '尚未导入角色';
  onboardingCameraState.textContent = cameraStream ? '已开启 · 画面仅在本机处理' : cameraStatus.textContent ?? '尚未开启';
  onboardingCameraButton.textContent = cameraStarting ? '正在开启…' : cameraStream ? '关闭摄像头' : '开启摄像头';
  onboardingCameraButton.disabled = cameraStarting;
  onboardingCalibrateButton.disabled = !modelCanAnimate || !cameraStream;
  onboardingBroadcastButton.disabled = !modelCanAnimate;
  updateBroadcastStatus();
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

const frameModel = (object: THREE.Object3D, preset: 'head' | 'upper' | 'full' = 'upper') => {
  if (!currentVrm || currentVrm.scene !== object) return;
  frameAvatar(currentVrm, camera, controls.target, preset);
  controls.update();
};

const refreshModelLibrary = async () => {
  storedModels = await listStoredModels();
  modelLibrary.replaceChildren(...(storedModels.length
    ? storedModels.map((model) => new Option(`${model.name.replace(/\.vrm$/i, '')} · ${(model.size / 1024 / 1024).toFixed(1)} MB`, model.id))
    : [new Option('尚无已保存角色', '')]));
  const active = storedModels.find((model) => model.id === currentModelId) ?? storedModels[0];
  modelLibrary.value = active?.id ?? '';
  renameModelButton.disabled = !active || importButton.disabled;
  loadModelButton.disabled = !active || importButton.disabled;
  deleteLibraryModelButton.disabled = !active || importButton.disabled;
  modelThumbnail.hidden = !active?.thumbnail;
  if (active?.thumbnail) modelThumbnail.src = active.thumbnail;
};

const refreshProfileLibrary = async () => {
  storedProfiles = await listStoredProfiles();
  profileLibrary.replaceChildren(...(storedProfiles.length
    ? storedProfiles.map((profile) => new Option(profile.name, profile.id))
    : [new Option('尚无配置档', '')]));
  applyProfileButton.disabled = storedProfiles.length === 0;
  deleteProfileButton.disabled = storedProfiles.length === 0;
};

const loadStoredModel = async (id: string, restored = false) => {
  const generation = ++loadGeneration;
  importButton.disabled = modelLibrary.disabled = loadModelButton.disabled = true;
  try {
    const stored = await getStoredModel(id);
    if (!stored || generation !== loadGeneration) return false;
    const loaded = await loadVrm(new File([stored.data], stored.name, { type: stored.type }), false, stored.id);
    if (loaded && restored) showToast('已恢复上次使用的角色和设置');
    return loaded;
  } catch (error) {
    if (generation === loadGeneration) {
      addDiagnosticEvent('model-library-load-error', error);
      showToast('无法读取本地角色，请重新导入原始 VRM');
    }
    return false;
  } finally {
    if (generation === loadGeneration) {
      importButton.disabled = modelLibrary.disabled = false;
      loadModelButton.disabled = !modelLibrary.value;
    }
  }
};

const restoreModel = async () => {
  const generation = loadGeneration;
  try {
    await refreshModelLibrary();
    await refreshProfileLibrary();
    const candidate = storedModels.find((model) => model.id === settings.activeModelId) ?? storedModels[0];
    if (candidate && generation === loadGeneration) await loadStoredModel(candidate.id, true);
  } catch (error) {
    console.warn('无法恢复上次模型', error);
    addDiagnosticEvent('model-restore-error', error);
  }
};

const inspectModel = (vrm: VRM, fileBytes: number) => {
  const expressions = vrm.expressionManager;
  const hasHead = Boolean(vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head));
  const hasBlink = Boolean(expressions?.getExpression(VRMExpressionPresetName.Blink)
    || (expressions?.getExpression(VRMExpressionPresetName.BlinkLeft) && expressions?.getExpression(VRMExpressionPresetName.BlinkRight)));
  const hasMouth = Boolean(expressions?.getExpression(VRMExpressionPresetName.Aa));
  const lookAtType = vrm.lookAt
    ? ((vrm.lookAt.applier.constructor as { type?: string }).type ?? 'unknown')
    : expressions?.getExpression(VRMExpressionPresetName.LookLeft) ? 'expression-fallback' : 'none';
  const hasLook = lookAtType !== 'none';
  const humanoidBones = Object.values(VRMHumanBoneName);
  const requiredBones = [
    VRMHumanBoneName.Hips, VRMHumanBoneName.Spine, VRMHumanBoneName.Head,
    VRMHumanBoneName.LeftUpperLeg, VRMHumanBoneName.LeftLowerLeg, VRMHumanBoneName.LeftFoot,
    VRMHumanBoneName.RightUpperLeg, VRMHumanBoneName.RightLowerLeg, VRMHumanBoneName.RightFoot,
    VRMHumanBoneName.LeftUpperArm, VRMHumanBoneName.LeftLowerArm, VRMHumanBoneName.LeftHand,
    VRMHumanBoneName.RightUpperArm, VRMHumanBoneName.RightLowerArm, VRMHumanBoneName.RightHand,
  ];
  const availableBones = humanoidBones.filter((name) => vrm.humanoid.getNormalizedBoneNode(name));
  const missingRequired = requiredBones.filter((name) => !vrm.humanoid.getNormalizedBoneNode(name));
  const meta = vrm.meta;
  const licenseLabels: Record<string, string> = {
    onlyAuthor: '仅作者本人', OnlyAuthor: '仅作者本人', onlySeparatelyLicensedPerson: '另行获得授权的人',
    ExplicitlyLicensedPerson: '另行获得授权的人', everyone: '任何人', Everyone: '任何人',
    personalNonProfit: '仅个人非营利使用', personalProfit: '个人可营利使用', corporation: '允许企业使用',
    required: '需要署名', unnecessary: '无需署名', Allow: '允许', Disallow: '不允许',
  };
  const friendly = (value: string | undefined) => value ? licenseLabels[value] ?? value : '未填写，请向作者确认';
  const author = meta.metaVersion === '1' ? meta.authors.join('、') : meta.author;
  const license = meta.metaVersion === '1'
    ? `谁能使用：${friendly(meta.avatarPermission)} · 营利使用：${friendly(meta.commercialUsage)} · 署名：${friendly(meta.creditNotation)} · 再分发：${meta.allowRedistribution == null ? '未填写' : meta.allowRedistribution ? '允许' : '不允许'}`
    : `谁能使用：${friendly(meta.allowedUserName)} · 营利使用：${friendly(meta.commercialUssageName)} · 许可：${friendly(meta.licenseName)}`;
  currentModelMeta = { vrmVersion: meta.metaVersion, author: author ?? '未填写', license };
  const metrics = collectModelMetrics(vrm.scene, fileBytes) as ModelMetrics;
  const performance = estimateModelPerformance(metrics);
  currentModelMetrics = metrics;
  const items = [
    ['头部骨骼', hasHead ? 'ok' : 'error', hasHead ? '头部转动可用' : '阻断：缺少 Head 骨骼，不能开始动捕'],
    ['眨眼表情', hasBlink ? 'ok' : 'warn', hasBlink ? '眨眼可用' : '提醒：头部和嘴型仍可使用'],
    ['嘴型表情', hasMouth ? 'ok' : 'warn', hasMouth ? '张嘴可用' : '提醒：头部和眨眼仍可使用'],
    ['视线控制', hasLook ? 'ok' : 'warn', hasLook ? '眼珠可以跟着视线动' : '提醒：眼睛不会跟随视线'],
    ['身体骨架', missingRequired.length === 0 ? 'ok' : 'warn', missingRequired.length === 0 ? `必需骨架完整（15/15）；已识别 ${availableBones.length} 个关节` : `缺少关节：${missingRequired.join('、')}；回到制作软件补全后重新导出`],
    ['模型作者', author ? 'ok' : 'warn', author ? `${author} · VRM ${meta.metaVersion}.x` : `未填写作者 · VRM ${meta.metaVersion}.x；直播前向模型来源方确认授权`],
    ['许可摘要', meta ? 'ok' : 'warn', `${license}；程序只展示模型声明，不替你判断授权`],
    ['三角面', metrics.triangles > 200_000 ? 'error' : metrics.triangles > 100_000 ? 'warn' : 'ok', `${metrics.triangles.toLocaleString('zh-CN')} 个三角面`],
    ['材质', metrics.materials > 60 ? 'error' : metrics.materials > 30 ? 'warn' : 'ok', `${metrics.materials} 个材质`],
    ['贴图', metrics.maxTextureSize > 4096 ? 'error' : metrics.maxTextureSize > 2048 ? 'warn' : 'ok', `${metrics.textures} 张 · 最大 ${metrics.maxTextureSize || '未知'} px`],
    ['显存估算', performance.level === 'heavy' ? 'error' : performance.level === 'warning' ? 'warn' : 'ok', `贴图约 ${performance.textureMegabytes} MB · 几何 ${(metrics.geometryBytes / 1024 / 1024).toFixed(1)} MB`],
  ] as const;
  diagnostics.replaceChildren(...items.map(([label, level, detail]) => {
    const item = document.createElement('li');
    item.className = level;
    const icon = document.createElement('span');
    icon.textContent = level === 'ok' ? '✓' : level === 'error' ? '×' : '!';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = label;
    const description = document.createElement('small');
    description.textContent = detail;
    copy.append(title, description);
    item.append(icon, copy);
    return item;
  }));
  diagnostics.hidden = false;
  doctorSummary.textContent = hasHead ? performance.label : '发现阻断问题';
  return { compatible: [hasHead, hasBlink, hasMouth, hasLook].filter(Boolean).length, canAnimate: hasHead, performance };
};

const loadVrm = async (file: File, persist = true, storedId = '') => {
  const validationError = validateModelFile(file, MAX_MODEL_SIZE);
  if (validationError) {
    setModelStatus(validationError, 'error');
    return false;
  }

  const generation = ++loadGeneration;
  const previousReady = stage.dataset.renderReady;
  const previousCanAnimate = modelCanAnimate;
  let replaced = false;
  modelPreparing = true;
  stage.dataset.renderReady = 'false';
  modelCanAnimate = false;
  broadcastButton.disabled = obsButton.disabled = true;
  importButton.disabled = true;
  modelLibrary.disabled = true;
  loadModelButton.disabled = true;
  onboardingImportButton.disabled = true;
  removeModelButton.disabled = true;
  renameModelButton.disabled = true;
  deleteLibraryModelButton.disabled = true;
  setModelStatus('正在本机读取模型…');
  const objectUrl = URL.createObjectURL(file);
  try {
    const gltf = await loader.loadAsync(objectUrl);
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error('文件中没有找到 VRM 数据');
    if (generation !== loadGeneration) {
      VRMUtils.deepDispose(vrm.scene);
      return false;
    }

    VRMUtils.rotateVRM0(vrm);
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    applyNaturalPose(vrm);
    if (currentVrm) {
      scene.remove(currentVrm.scene);
      VRMUtils.deepDispose(currentVrm.scene);
    }

    bodyTracking.resetPose();
    currentVrm = vrm;
    // A failed save must not attach the new avatar's colors to the old library entry.
    currentModelId = '';
    replaced = true;
    thumbnailPendingId = '';
    scene.add(vrm.scene);
    frameModel(vrm.scene, settings.viewPreset);
    headRest.copy(vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head)?.quaternion ?? new THREE.Quaternion());
    chestRest.copy((vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Chest) ?? vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Spine))?.quaternion ?? new THREE.Quaternion());
    modelName.textContent = file.name.replace(/\.vrm$/i, '');
    const report = inspectModel(vrm, file.size);
    modelCanAnimate = false;
    broadcastButton.disabled = true;
    obsButton.disabled = true;
    setModelStatus('正在准备画面… 首次显示角色可能需要几秒');
    updateOnboarding();
    await prepareAvatarFrame(renderer, scene, camera, () => generation === loadGeneration);
    if (generation !== loadGeneration) return false;
    modelPreparing = false;
    stage.dataset.renderReady = 'true';
    modelCanAnimate = report.canAnimate;
    setModelStatus(`${report.canAnimate ? '模型可用' : '模型受限'} · 兼容性 ${report.compatible}/4 · ${report.performance.label} · ${(file.size / 1024 / 1024).toFixed(1)} MB`, report.canAnimate ? 'normal' : 'error');
    dropHint.hidden = true;
    calibrateButton.disabled = !cameraStream || !modelCanAnimate;
    broadcastButton.disabled = !modelCanAnimate;
    obsButton.disabled = !modelCanAnimate;
    updateOnboarding();
    if (document.body.classList.contains('broadcast-mode') && modelCanAnimate && !cameraStream) void startCamera();
    try {
      const saved = persist ? await putStoredModel(file) : storedId ? await getStoredModel(storedId) : undefined;
      if (generation !== loadGeneration) return false;
      currentModelId = saved?.id ?? storedId;
      if (currentModelId) {
        settings = { ...settings, activeModelId: currentModelId };
        saveSettings();
        if (!saved?.thumbnail) thumbnailPendingId = currentModelId;
      }
      await refreshModelLibrary();
      if (generation !== loadGeneration) return false;
    } catch (error) {
      if (generation !== loadGeneration) return false;
      console.warn('无法保存模型', error);
      addDiagnosticEvent('model-save-error', error);
      showToast('角色已加载，但浏览器空间不足，刷新后需要重新导入');
    }
    studio.reloadAppearance();
    return true;
  } catch (error) {
    if (generation !== loadGeneration) return false;
    console.error(error);
    addDiagnosticEvent('model-load-error', error);
    if (!replaced) {
      modelCanAnimate = previousCanAnimate;
      stage.dataset.renderReady = previousReady ?? 'false';
      broadcastButton.disabled = obsButton.disabled = !modelCanAnimate;
    }
    setModelStatus(modelLoadErrorMessage(error), 'error');
    updateBroadcastStatus();
    return false;
  } finally {
    URL.revokeObjectURL(objectUrl);
    if (generation === loadGeneration) {
      modelPreparing = false;
      updateBroadcastStatus();
      importButton.disabled = false;
      modelLibrary.disabled = false;
      loadModelButton.disabled = !modelLibrary.value;
      onboardingImportButton.disabled = false;
      removeModelButton.disabled = !currentVrm;
      renameModelButton.disabled = !modelLibrary.value;
      deleteLibraryModelButton.disabled = !modelLibrary.value;
      fileInput.value = '';
    }
  }
};

const createDetector = async () => {
  setTrackingState('loading', '正在加载动捕引擎（首次约数秒）');
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  };
  return createWithGpuFallback(
    (detectorOptions) => FaceLandmarker.createFromOptions(vision, detectorOptions),
    options,
    (gpuError) => {
    console.warn('GPU 初始化失败，改用 CPU', gpuError);
    addDiagnosticEvent('detector-gpu-fallback', gpuError);
    },
  );
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
  bodyTracking.stop();
  stopMediaStream(cameraStream);
  cameraStream = null;
  cameraPreview.srcObject = null;
  cameraPreview.hidden = true;
  cameraStatus.textContent = '尚未开启';
  cameraButton.textContent = '开启摄像头';
  calibrateButton.disabled = true;
  faceVisible = false;
  lastVideoTime = -1;
  lastInferenceAt = 0;
  targetMotion = { ...EMPTY_MOTION };
  if (hasNeutral) latestHead.copy(neutralHead);
  detectedFrames = 0;
  lastFpsAt = performance.now();
  setTrackingQuality();
  setTrackingState(faceLandmarker ? 'ready' : 'idle', faceLandmarker ? '引擎已就绪' : '等待开启摄像头');
  updateOnboarding();
};

const startCamera = async () => {
  if (cameraStarting) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = location.protocol === 'file:' ? '请通过本地服务器打开程序' : '当前环境不支持摄像头';
    return;
  }

  cameraStarting = true;
  cameraButton.disabled = true;
  cameraSelect.disabled = true;
  cameraStatus.textContent = '正在请求权限…';
  updateOnboarding();
  let stream: MediaStream | null = null;
  let detectorReady = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(cameraSelect.value));
    await ensureDetector();
    detectorReady = true;
    cameraStream = stream;
    const activeStream = stream;
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (cameraStream !== activeStream) return;
      stopCamera();
      cameraStatus.textContent = '摄像头已断开或被系统停止：请重新连接后点击开启';
      setTrackingState('error', '摄像头连接已断开');
      updateOnboarding();
    }, { once: true }));
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
    stopMediaStream(stream);
    stopCamera();
    if (stream && !detectorReady) {
      cameraStatus.textContent = '摄像头可用，但动捕引擎未能加载';
      setTrackingState('error', '本地动捕资源加载失败：请重新启动；仍失败时重新解压或构建');
    } else {
      cameraStatus.textContent = cameraErrorMessage(error, desktopRuntime);
    }
  } finally {
    cameraStarting = false;
    cameraButton.disabled = false;
    cameraSelect.disabled = false;
    updateOnboarding();
  }
};

const readHeadRotation = (result: FaceLandmarkerResult) => {
  const matrix = result.facialTransformationMatrixes[0];
  if (!matrix || matrix.data.length !== 16) return null;
  faceMatrix.fromArray(matrix.data);
  faceMatrix.decompose(facePosition, faceQuaternion, faceScale);
  return faceQuaternion.clone();
};

const processDetection = (result: FaceLandmarkerResult) => {
  const categories = result.faceBlendshapes[0]?.categories;
  const head = readHeadRotation(result);
  if (!categories || !head) {
    targetMotion = { ...EMPTY_MOTION };
    return;
  }

  latestHead.copy(head);
  if (!hasNeutral) {
    neutralHead.copy(head);
    hasNeutral = true;
  }
  targetMotion = scaleMotion(mirrorMotion(solveExpressions(categories as Category[]) as Motion, settings.mirror), settings.sensitivity);
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
  const alpha = damping(delta, 18 / settings.smoothing);
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
    if (!currentVrm.lookAt) {
      setExpression(VRMExpressionPresetName.LookUp, currentMotion.lookUp);
      setExpression(VRMExpressionPresetName.LookDown, currentMotion.lookDown);
      setExpression(VRMExpressionPresetName.LookLeft, currentMotion.lookLeft);
      setExpression(VRMExpressionPresetName.LookRight, currentMotion.lookRight);
    }
  }

  if (currentVrm.lookAt) {
    const gaze = gazeAngles(currentMotion);
    currentVrm.lookAt.autoUpdate = false;
    currentVrm.lookAt.yaw = gaze.yaw;
    currentVrm.lookAt.pitch = gaze.pitch;
  }

  const head = currentVrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head);
  if (head && hasNeutral) {
    headTarget.copy(headRest).multiply(vrmRotation(relativeHeadRotation(latestHead, neutralHead, settings.sensitivity, settings.mirror), currentVrm.meta.metaVersion));
    head.quaternion.slerp(headTarget, alpha);
  }

  const chest = currentVrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Chest) ?? currentVrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Spine);
  if (chest) {
    const breath = faceVisible ? 0 : Math.sin(performance.now() / 1_300) * 0.018;
    chestTarget.copy(chestRest).multiply(vrmRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(breath, 0, 0)), currentVrm.meta.metaVersion));
    chest.quaternion.slerp(chestTarget, Math.min(alpha * 0.45, 1));
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
  smoothingInput.value = String(settings.smoothing);
  smoothingValue.value = settings.smoothing < 0.9 ? '灵敏' : settings.smoothing > 1.1 ? '稳定' : '标准';
  renderQualitySelect.value = settings.renderQuality;
  outputAspectSelect.value = settings.outputAspect;
  mirrorInput.checked = settings.mirror;
  cameraSelect.value = settings.cameraId;
  renderer.setPixelRatio(renderPixelRatio(settings.renderQuality, window.devicePixelRatio));
  applyBackground();
  stage.dataset.aspect = settings.outputAspect;
  viewPresetButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === settings.viewPreset)));
  if (currentVrm) frameModel(currentVrm.scene, settings.viewPreset);
  resize();
};

const removeCurrentModel = async (deleteRecord = true) => {
  const generation = ++loadGeneration;
  if (deleteRecord && currentModelId) await deleteStoredModel(currentModelId);
  if (generation !== loadGeneration) return;
  importButton.disabled = modelLibrary.disabled = onboardingImportButton.disabled = false;
  if (currentVrm) {
    scene.remove(currentVrm.scene);
    VRMUtils.deepDispose(currentVrm.scene);
  }
  currentVrm = null;
  studio.reloadAppearance();
  modelPreparing = false;
  stage.dataset.renderReady = 'false';
  currentModelId = '';
  settings = { ...settings, activeModelId: '' };
  saveSettings();
  currentModelMetrics = null;
  currentModelMeta = null;
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
  await refreshModelLibrary();
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
    environment: { browser: coarseUserAgent(navigator.userAgent), language: navigator.language, online: navigator.onLine },
    graphics,
    settings: createSettingsProfile(settings).settings,
    model: { metrics: currentModelMetrics, metadataSummary: currentModelMeta },
    camera: trackSettings ? { active: true, width: trackSettings.width, height: trackSettings.height, frameRate: trackSettings.frameRate } : { active: false },
    tracking: { status: trackingStatus.textContent, faceVisible },
    recentEvents: diagnosticEvents,
  });
  showToast('诊断报告已下载，可在反馈问题时附上');
};

const runPreflight = async () => {
  runPreflightButton.disabled = true;
  runPreflightButton.textContent = '检查中…';
  const results: { level: 'ok' | 'warn' | 'error'; text: string }[] = [];
  const localRuntime = location.protocol === 'https:' || ['127.0.0.1', 'localhost', 'tauri.localhost'].includes(location.hostname);
  results.push({ level: localRuntime ? 'ok' : 'error', text: localRuntime ? '运行环境允许摄像头权限' : '当前地址不是安全/本地环境，摄像头可能不可用' });
  results.push({ level: renderer.getContext().isContextLost() ? 'error' : 'ok', text: renderer.getContext().isContextLost() ? '3D 画面已丢失，请重新启动 3D' : '3D 画面正常' });
  results.push({ level: modelCanAnimate ? 'ok' : 'error', text: modelCanAnimate ? '角色可用' : '没有可动的角色' });
  results.push({ level: cameraStream ? 'ok' : 'warn', text: cameraStream ? '摄像头已开启' : '摄像头未开启' });
  results.push({ level: faceVisible ? 'ok' : 'warn', text: faceVisible ? `已检测到人脸：${trackingStatus.textContent}` : '尚未检测到人脸，请正对镜头并校准' });
  try {
    const response = await fetch(MODEL_URL, { method: 'HEAD', cache: 'no-store' });
    results.push({ level: response.ok ? 'ok' : 'error', text: response.ok ? '离线动捕模型资源完整' : `动捕模型资源返回 HTTP ${response.status}` });
  } catch (error) {
    addDiagnosticEvent('preflight-assets-error', error);
    results.push({ level: 'error', text: '无法读取本地动捕资源，请重新解压或安装' });
  }
  try {
    const estimate = await navigator.storage?.estimate();
    const free = estimate?.quota && estimate.usage != null ? (estimate.quota - estimate.usage) / 1024 / 1024 : 0;
    results.push({ level: free > 250 || !estimate ? 'ok' : 'warn', text: estimate ? `本地可用空间约 ${Math.max(0, Math.round(free))} MB` : '浏览器未提供空间估算；角色库仍可使用' });
  } catch (error) {
    addDiagnosticEvent('preflight-storage-error', error);
    results.push({ level: 'warn', text: '无法估算本地空间，请避免一次保存过多大型角色' });
  }
  results.push({ level: background === 'green' ? 'ok' : 'warn', text: background === 'green' ? `输出已设为绿幕 · ${settings.outputAspect}` : `当前背景为${background === 'transparent' ? '网页透明' : '影棚'}；窗口捕获建议改成绿幕` });
  preflightResults.replaceChildren(...results.map((result) => {
    const item = document.createElement('li');
    item.className = result.level;
    item.textContent = `${result.level === 'ok' ? '通过' : result.level === 'warn' ? '提醒' : '处理'}：${result.text}`;
    return item;
  }));
  addDiagnosticEvent('preflight-finished', results.map((result) => `${result.level}:${result.text}`).join(' | '));
  runPreflightButton.disabled = false;
  runPreflightButton.textContent = '重新检查';
};

document.getElementById('setup-obs')!.addEventListener('click', async event => {
  const button = event.currentTarget as HTMLButtonElement;
  const input = document.getElementById('obs-password') as HTMLInputElement;
  const status = document.getElementById('obs-setup-status')!;
  if (!modelCanAnimate) { status.textContent = '请先加载角色并等待画面准备好'; return; }
  button.disabled = true;
  const password = input.value; input.value = '';
  enterBroadcast();
  try { const result = await configureObs(password); status.textContent = result; showToast('OBS 场景已创建，请在 OBS 中预览'); }
  catch (error) { exitBroadcast(); status.textContent = error instanceof Error ? error.message : 'OBS 配置失败'; }
  finally { button.disabled = false; }
});
let backgroundBeforeBroadcast: Background | null = null;
const enterBroadcast = () => {
  document.body.classList.add('broadcast-mode');
  cameraPreview.hidden = true;
  broadcastButton.textContent = '退出直播画面';
  const broadcast = broadcastBackground(background);
  background = broadcast.background;
  backgroundBeforeBroadcast = broadcast.previous;
  applyBackground();
  updateBroadcastStatus();
  showToast('按 Esc 或双击返回；下一步在直播软件中添加窗口捕获并抠绿幕');
};

const exitBroadcast = () => {
  document.body.classList.remove('broadcast-mode');
  cameraPreview.hidden = !cameraStream;
  broadcastButton.textContent = '进入直播画面';
  background = restoreBroadcastBackground(background, backgroundBeforeBroadcast);
  backgroundBeforeBroadcast = null;
  applyBackground();
  updateBroadcastStatus();
};

const copyObsUrl = async () => {
  if (desktopRuntime) return;
  const url = obsBrowserSourceUrl(location.origin, location.pathname);
  try {
    await navigator.clipboard.writeText(url);
    onboardingFinishState.textContent = '实验地址已复制：OBS 内须重新导入模型、单独授权摄像头。推荐使用窗口捕获。';
    showToast('实验地址已复制；OBS 不共享角色库和摄像头权限，推荐窗口捕获');
  } catch {
    onboardingFinishState.textContent = `无法自动复制，请手动复制：${url}`;
    showToast(url);
  }
};

importButton.addEventListener('click', () => fileInput.click());
document.getElementById('load-miao')!.addEventListener('click', async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true;
  try {
    const response = await fetch(new URL('./examples/miao-cat.vrm', document.baseURI));
    if (!response.ok) throw new Error('原创示例文件不完整');
    await loadVrm(new File([await response.blob()], '喵小动 · 原创猫咪.vrm', { type: 'model/vrm', lastModified: 0 }));
  } catch { showToast('无法读取原创角色，请重新解压完整程序'); }
  finally { button.disabled = false; }
});
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
smoothingInput.addEventListener('input', () => {
  settings = { ...settings, smoothing: Number(smoothingInput.value) };
  smoothingValue.value = settings.smoothing < 0.9 ? '灵敏' : settings.smoothing > 1.1 ? '稳定' : '标准';
  saveSettings();
});
renderQualitySelect.addEventListener('change', () => {
  settings = { ...settings, renderQuality: renderQualitySelect.value as AppSettings['renderQuality'] };
  renderer.setPixelRatio(renderPixelRatio(settings.renderQuality, window.devicePixelRatio));
  resize();
  saveSettings();
  showToast(`画面质量已切换为${renderQualitySelect.selectedOptions[0]?.textContent ?? '新档位'}`);
});
mirrorInput.addEventListener('change', () => {
  settings = { ...settings, mirror: mirrorInput.checked };
  saveSettings();
  showToast(`镜像动作已${settings.mirror ? '开启' : '关闭'}；请用左右转头和单眼眨眼检查方向`);
});
viewPresetButtons.forEach((button) => button.addEventListener('click', () => {
  if (!currentVrm) {
    showToast('请先导入角色');
    return;
  }
  const preset = button.dataset.view;
  if (preset === 'head' || preset === 'upper' || preset === 'full') {
    settings = { ...settings, viewPreset: preset };
    saveSettings();
    frameModel(currentVrm.scene, preset);
    viewPresetButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  }
}));
outputAspectSelect.addEventListener('change', () => {
  settings = { ...settings, outputAspect: outputAspectSelect.value as AppSettings['outputAspect'] };
  stage.dataset.aspect = settings.outputAspect;
  saveSettings();
  resize();
});
modelLibrary.addEventListener('change', () => {
  if (modelLibrary.value && modelLibrary.value !== currentModelId) void loadStoredModel(modelLibrary.value);
  const selected = storedModels.find((model) => model.id === modelLibrary.value);
  modelThumbnail.hidden = !selected?.thumbnail;
  if (selected?.thumbnail) modelThumbnail.src = selected.thumbnail;
});
loadModelButton.addEventListener('click', () => { if (modelLibrary.value) void loadStoredModel(modelLibrary.value); });
renameModelButton.addEventListener('click', () => {
  const selected = storedModels.find((model) => model.id === modelLibrary.value);
  if (!selected) return;
  const name = window.prompt('给角色起一个名称', selected.name.replace(/\.vrm$/i, ''))?.trim();
  if (!name) return;
  const fileName = `${name.slice(0, 80)}.vrm`;
  void updateStoredModel(selected.id, { name: fileName }).then(async () => {
    if (selected.id === currentModelId) modelName.textContent = name.slice(0, 80);
    await refreshModelLibrary();
    modelLibrary.value = selected.id;
    showToast('角色已重命名');
  }).catch((error) => {
    addDiagnosticEvent('model-rename-error', error);
    showToast('重命名失败，请稍后重试');
  });
});
deleteLibraryModelButton.addEventListener('click', () => {
  const id = modelLibrary.value;
  if (!id || !window.confirm('删除这个浏览器中保存的角色副本？原始 VRM 文件不会删除。')) return;
  const active = id === currentModelId;
  const generation = loadGeneration;
  void deleteStoredModel(id).then(async () => {
    if (generation !== loadGeneration) {
      if (!importButton.disabled) await refreshModelLibrary();
      showToast('旧角色副本已删除，保留正在使用的新角色');
      return;
    }
    if (active) await removeCurrentModel(false);
    const afterRemoval = loadGeneration;
    await refreshModelLibrary();
    const next = storedModels[0];
    if (active && next && afterRemoval === loadGeneration && !currentVrm) await loadStoredModel(next.id);
    showToast('角色副本已删除');
  }).catch((error) => {
    addDiagnosticEvent('model-delete-error', error);
    showToast('删除失败，请稍后重试');
  });
});
saveProfileButton.addEventListener('click', () => {
  const name = profileNameInput.value.trim().slice(0, 40);
  if (!name) {
    showToast('请先填写配置档名称');
    profileNameInput.focus();
    return;
  }
  const existing = storedProfiles.find((profile) => profile.name === name);
  const profile: StoredProfile = {
    id: existing?.id ?? crypto.randomUUID(),
    name: name.slice(0, 40),
    modelId: currentModelId,
    settings: createSettingsProfile({ ...settings, activeModelId: currentModelId }).settings,
    updatedAt: Date.now(),
  };
  void putStoredProfile(profile).then(async () => {
    await refreshProfileLibrary();
    profileLibrary.value = profile.id;
    showToast(existing ? '配置档已更新' : '配置档已保存');
  }).catch((error) => {
    addDiagnosticEvent('profile-save-error', error);
    showToast('配置档保存失败');
  });
});
applyProfileButton.addEventListener('click', () => {
  const profile = storedProfiles.find((item) => item.id === profileLibrary.value);
  if (!profile) return;
  settings = { ...settings, ...profile.settings, onboardingComplete: settings.onboardingComplete, activeModelId: profile.modelId };
  saveSettings();
  applySettingsToControls();
  profileNameInput.value = profile.name;
  const finish = () => showToast('配置档已应用');
  if (profile.modelId && profile.modelId !== currentModelId) void loadStoredModel(profile.modelId).finally(finish);
  else finish();
});
deleteProfileButton.addEventListener('click', () => {
  const id = profileLibrary.value;
  if (!id || !window.confirm('删除这个配置档？角色模型不会删除。')) return;
  void deleteStoredProfile(id).then(async () => {
    await refreshProfileLibrary();
    profileNameInput.value = '';
    showToast('配置档已删除');
  }).catch((error) => {
    addDiagnosticEvent('profile-delete-error', error);
    showToast('配置档删除失败');
  });
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
runPreflightButton.addEventListener('click', () => { void runPreflight(); });
viewDiagnosticsButton.addEventListener('click', () => {
  diagnosticsLog.replaceChildren(...(diagnosticEvents.length
    ? diagnosticEvents.slice().reverse().map((event) => {
      const item = document.createElement('li');
      item.textContent = `${event.at} · ${event.kind} · ${event.message}`;
      return item;
    })
    : [Object.assign(document.createElement('li'), { textContent: '暂无诊断事件' })]));
  if (!diagnosticsDialog.open) diagnosticsDialog.showModal();
});
clearDiagnosticsButton.addEventListener('click', () => {
  diagnosticEvents = [];
  try { localStorage.removeItem(DIAGNOSTICS_KEY); } catch { /* Private contexts may block storage. */ }
  diagnosticsLog.replaceChildren(Object.assign(document.createElement('li'), { textContent: '暂无诊断事件' }));
  showToast('本地诊断日志已清除');
});
closeDiagnosticsButton.addEventListener('click', () => diagnosticsDialog.close());
profileLibrary.addEventListener('change', () => {
  const profile = storedProfiles.find((item) => item.id === profileLibrary.value);
  profileNameInput.value = profile?.name ?? '';
  applyProfileButton.disabled = !profile;
  deleteProfileButton.disabled = !profile;
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
required('#onboarding-skip').addEventListener('click', () => { onboardingStep = 2; updateOnboarding(); });
required('#onboarding-skip-camera').addEventListener('click', () => { onboardingStep = 3; updateOnboarding(); });
required<HTMLSelectElement>('#onboarding-platform').addEventListener('change', (event) => {
  required<HTMLAnchorElement>('#platform-guide').href = `./platforms.html#${(event.target as HTMLSelectElement).value}`;
});
// Only a local, explicitly configured and licensed asset can enable this entry.
void fetch('./example-avatar.json').then(response => response.json()).then(config => {
  if (!config.path || !/^\.\/examples\/[\w.-]+\.vrm$/.test(config.path) || !config.license) return;
  const button = required<HTMLButtonElement>('#load-example');
  button.disabled = false;
  button.textContent = '先用 pixiv 示例角色试试';
  button.addEventListener('click', () => {
    void fetch(config.path).then(response => { if (!response.ok) throw new Error('示例角色读取失败'); return response.blob(); })
      .then(blob => loadVrm(new File([blob], 'pixiv 技术示例角色.vrm', { type: 'model/vrm', lastModified: 0 })))
      .catch(() => showToast('示例角色不可用，请导入自己的 VRM 或先跳过'));
  });
}).catch(() => { /* Optional example asset is not configured. */ });
onboardingCameraButton.addEventListener('click', () => {
  if (cameraStream) stopCamera();
  else void startCamera();
});
onboardingCalibrateButton.addEventListener('click', calibrate);
onboardingBroadcastButton.addEventListener('click', () => {
  background = 'green';
  settings = { ...settings, background, onboardingComplete: true };
  saveSettings();
  applyBackground();
  onboardingFinishState.textContent = '绿幕直播画面已打开。在 OBS 添加“窗口捕获”，选择 MIAO Motion，再添加色度键。';
  onboardingDialog.close();
  enterBroadcast();
});
broadcastImportButton.addEventListener('click', () => fileInput.click());

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
stage.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && !document.body.classList.contains('broadcast-mode')) {
    event.preventDefault();
    fileInput.click();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('broadcast-mode')) exitBroadcast();
  const target = event.target as HTMLElement | null;
  const editing = target?.matches('input, textarea, select, [contenteditable="true"]');
  if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'r' && currentVrm) {
    frameModel(currentVrm.scene, settings.viewPreset);
    showToast('角色画面已重新居中');
  }
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
  if (currentVrm) frameModel(currentVrm.scene, settings.viewPreset);
};
new ResizeObserver(resize).observe(stage);
applySettingsToControls(!requestedBackground);
obsButton.hidden = desktopRuntime;
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
  retry3dButton.hidden = false;
  showToast('3D 画面发生错误，请下载诊断报告后刷新页面');
});

window.addEventListener('error', (event) => { addDiagnosticEvent('unhandled-error', event.error ?? event.message); });
window.addEventListener('unhandledrejection', (event) => { addDiagnosticEvent('unhandled-rejection', event.reason); });
addDiagnosticEvent('app-start', `broadcast=${startsInBroadcastMode}`);

const animate = () => {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();
  phone.tick(now);
  if (now - lastPhoneFrame > 500 && faceLandmarker && cameraStream && cameraPreview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && cameraPreview.currentTime !== lastVideoTime && now - lastInferenceAt >= 25) {
    lastVideoTime = cameraPreview.currentTime;
    lastInferenceAt = now;
    try {
      processDetection(faceLandmarker.detectForVideo(cameraPreview, now));
    } catch (error) {
      console.error('动捕帧处理失败', error);
      addDiagnosticEvent('tracking-frame-error', error);
      stopCamera();
      try { faceLandmarker?.close(); } catch { /* Failed detector may already be closed. */ }
      faceLandmarker = null;
      detectorPromise = null;
      cameraStatus.textContent = '动捕处理失败，摄像头已安全关闭';
      setTrackingState('error', '动捕发生错误，请重启摄像头');
    }
  }
  if (faceVisible && now - lastDetectionAt > 500) {
    faceVisible = false;
    if (hasNeutral) latestHead.copy(neutralHead);
    detectedFrames = 0;
    lastFpsAt = now;
    setTrackingQuality();
    setTrackingState('lost', '未检测到人脸');
  }
  if (!faceVisible) {
    const blink = idleBlink(now);
    targetMotion = { ...EMPTY_MOTION, blinkLeft: blink, blinkRight: blink };
  }
  if (now - lastFpsAt >= 1000 && faceVisible) {
    const fps = Math.round(detectedFrames * 1000 / (now - lastFpsAt));
    const quality = trackingQuality(fps, true);
    setTrackingQuality(fps, true);
    setTrackingState('active', `正在驱动角色 · 每秒 ${fps} 帧 · ${quality.label}`);
    detectedFrames = 0;
    lastFpsAt = now;
  }
  bodyTracking.tick(cameraPreview, now, Boolean(cameraStream));
  applyMotion(delta);
  studio.apply();
  studio.quality(now, settings.renderQuality === 'auto');
  currentVrm?.update(delta);
  controls.update();
  renderer.render(scene, camera);
  nativeCamera.tick(now);
  if (thumbnailPendingId) {
    const id = thumbnailPendingId;
    thumbnailPendingId = '';
    try {
      const preview = document.createElement('canvas');
      preview.width = 160;
      preview.height = 160;
      const scale = Math.min(160 / canvas.width, 160 / canvas.height);
      const w = canvas.width * scale, h = canvas.height * scale;
      preview.getContext('2d')?.drawImage(canvas, (160 - w) / 2, (160 - h) / 2, w, h);
      const thumbnail = preview.toDataURL('image/webp', 0.72);
      void updateStoredModel(id, { thumbnail }).then(refreshModelLibrary).catch((error) => addDiagnosticEvent('thumbnail-save-error', error));
    } catch (error) {
      addDiagnosticEvent('thumbnail-capture-error', error);
    }
  }
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
window.addEventListener('pagehide', stopCamera);
