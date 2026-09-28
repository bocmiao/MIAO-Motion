import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';

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

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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
const clock = new THREE.Clock();

const setModelStatus = (message: string, kind: 'normal' | 'error' = 'normal') => {
  modelStatus.textContent = message;
  modelStatus.dataset.kind = kind;
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

const loadVrm = async (file: File) => {
  if (!file.name.toLowerCase().endsWith('.vrm')) {
    setModelStatus('请选择 .vrm 模型文件', 'error');
    return;
  }
  if (file.size > 200 * 1024 * 1024) {
    setModelStatus('模型超过 200 MB，当前原型暂不加载', 'error');
    return;
  }

  setModelStatus('正在本机读取模型…');
  const objectUrl = URL.createObjectURL(file);

  try {
    const gltf = await loader.loadAsync(objectUrl);
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error('文件中没有找到 VRM 数据');

    VRMUtils.rotateVRM0(vrm);
    if (currentVrm) {
      scene.remove(currentVrm.scene);
      VRMUtils.deepDispose(currentVrm.scene);
    }

    currentVrm = vrm;
    scene.add(vrm.scene);
    frameModel(vrm.scene);
    modelName.textContent = file.name.replace(/\.vrm$/i, '');
    setModelStatus('模型已在本机载入 · 拖动旋转，滚轮缩放');
    dropHint.hidden = true;
  } catch (error) {
    console.error(error);
    setModelStatus(error instanceof Error ? error.message : '模型加载失败', 'error');
  } finally {
    URL.revokeObjectURL(objectUrl);
    fileInput.value = '';
  }
};

const stopCamera = () => {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraPreview.srcObject = null;
  cameraPreview.hidden = true;
  cameraStatus.textContent = '尚未开启';
  cameraButton.textContent = '开启摄像头';
};

const startCamera = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = '当前环境不支持摄像头';
    return;
  }

  cameraButton.disabled = true;
  cameraStatus.textContent = '正在请求权限…';
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    cameraPreview.srcObject = cameraStream;
    await cameraPreview.play();
    cameraPreview.hidden = false;
    cameraStatus.textContent = '已开启 · 画面不会上传';
    cameraButton.textContent = '关闭摄像头';
  } catch (error) {
    console.error(error);
    cameraStatus.textContent = '未获得摄像头权限';
  } finally {
    cameraButton.disabled = false;
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

const resize = () => {
  const width = Math.max(stage.clientWidth, 1);
  const height = Math.max(stage.clientHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};

new ResizeObserver(resize).observe(stage);
resize();

const animate = () => {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  currentVrm?.update(delta);
  controls.update();
  renderer.render(scene, camera);
};
animate();

window.addEventListener('beforeunload', stopCamera);

