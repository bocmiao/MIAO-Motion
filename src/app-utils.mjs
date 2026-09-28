const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const DEFAULT_SETTINGS = Object.freeze({
  background: 'studio',
  cameraId: '',
  sensitivity: 1,
});

export function parseSettings(raw) {
  try {
    const value = JSON.parse(raw ?? 'null');
    const background = ['studio', 'green', 'transparent'].includes(value?.background)
      ? value.background
      : DEFAULT_SETTINGS.background;
    return {
      background,
      cameraId: typeof value?.cameraId === 'string' ? value.cameraId : '',
      sensitivity: Number.isFinite(value?.sensitivity)
        ? clamp(value.sensitivity, 0.5, 1.5)
        : DEFAULT_SETTINGS.sensitivity,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function validateModelFile(file, maxBytes) {
  if (!file.name.toLowerCase().endsWith('.vrm')) return '请选择 .vrm 模型文件';
  if (file.size === 0) return '模型文件为空，请重新导出后再试';
  if (file.size > maxBytes) return `模型超过 ${Math.round(maxBytes / 1024 / 1024)} MB，请先压缩纹理`;
  return '';
}

export function cameraConstraints(cameraId = '') {
  return {
    audio: false,
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
      ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'user' }),
    },
  };
}

export function cameraErrorMessage(error) {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return '没有摄像头权限：请在浏览器地址栏允许后重试';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '没有找到所选摄像头：请重新连接或选择其他设备';
  if (name === 'NotReadableError' || name === 'AbortError') return '摄像头正被其他程序占用：关闭占用程序后重试';
  return '摄像头启动失败：请检查设备、权限和网络后重试';
}

export function trackingQuality(fps, faceVisible) {
  if (!faceVisible) return { label: '等待人脸', level: 'idle', value: 0 };
  if (fps >= 24) return { label: '良好', level: 'good', value: Math.min(fps, 30) };
  if (fps >= 15) return { label: '可用', level: 'fair', value: fps };
  return { label: '偏低', level: 'weak', value: fps };
}

export function scaleMotion(motion, sensitivity) {
  return Object.fromEntries(Object.entries(motion).map(([key, value]) => [key, clamp(value * sensitivity, 0, 1)]));
}
