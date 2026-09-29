const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const DEFAULT_SETTINGS = Object.freeze({
  activeModelId: '',
  background: 'studio',
  cameraId: '',
  bodyTracking: false,
  mirror: true,
  onboardingComplete: false,
  outputAspect: 'auto',
  renderQuality: 'balanced',
  sensitivity: 1,
  smoothing: 1,
  viewPreset: 'upper',
});

export function parseSettings(raw) {
  try {
    const value = JSON.parse(raw ?? 'null');
    const background = ['studio', 'green', 'transparent'].includes(value?.background)
      ? value.background
      : DEFAULT_SETTINGS.background;
    const renderQuality = ['auto', 'performance', 'balanced', 'quality'].includes(value?.renderQuality)
      ? value.renderQuality
      : DEFAULT_SETTINGS.renderQuality;
    const outputAspect = ['auto', '16:9', '9:16', '1:1'].includes(value?.outputAspect)
      ? value.outputAspect
      : DEFAULT_SETTINGS.outputAspect;
    const viewPreset = ['head', 'upper', 'full'].includes(value?.viewPreset)
      ? value.viewPreset
      : DEFAULT_SETTINGS.viewPreset;
    return {
      activeModelId: typeof value?.activeModelId === 'string' ? value.activeModelId : '',
      background,
      bodyTracking: value?.bodyTracking === true,
      cameraId: typeof value?.cameraId === 'string' ? value.cameraId : '',
      mirror: value?.mirror !== false,
      onboardingComplete: value?.onboardingComplete === true,
      outputAspect,
      renderQuality,
      sensitivity: Number.isFinite(value?.sensitivity)
        ? clamp(value.sensitivity, 0.5, 1.5)
        : DEFAULT_SETTINGS.sensitivity,
      smoothing: Number.isFinite(value?.smoothing)
        ? clamp(value.smoothing, 0.5, 2)
        : DEFAULT_SETTINGS.smoothing,
      viewPreset,
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

export { cameraConstraints, cameraErrorMessage, createWithGpuFallback, stopMediaStream } from './capture.mjs';

export function trackingQuality(fps, faceVisible) {
  if (!faceVisible) return { label: '等待人脸', level: 'idle', value: 0 };
  if (fps >= 24) return { label: '良好', level: 'good', value: Math.min(fps, 30) };
  if (fps >= 15) return { label: '可用', level: 'fair', value: fps };
  return { label: '偏低', level: 'weak', value: fps };
}

export function scaleMotion(motion, sensitivity) {
  return Object.fromEntries(Object.entries(motion).map(([key, value]) => [key, clamp(value * sensitivity, 0, 1)]));
}

export function onboardingState(step, hasModel, hasCamera) {
  const current = clamp(Number.isFinite(step) ? Math.trunc(step) : 0, 0, 3);
  const canContinue = current === 1 ? hasModel : current === 2 ? hasCamera : true;
  return {
    current,
    canContinue,
    nextLabel: current === 3 ? '完成，开始使用' : '下一步',
    progress: `${current + 1}/4`,
  };
}

export function renderPixelRatio(quality, devicePixelRatio = 1) {
  const cap = quality === 'performance' ? 1 : quality === 'quality' ? 2 : 1.5;
  return Math.min(Math.max(devicePixelRatio, 1), cap);
}

export function estimateModelPerformance(metrics) {
  const textureMegabytes = metrics.textureBytes / 1024 / 1024;
  const heavy = metrics.triangles > 200_000
    || metrics.materials > 60
    || metrics.maxTextureSize > 4096
    || textureMegabytes > 512
    || metrics.fileBytes > 150 * 1024 * 1024;
  const warning = metrics.triangles > 100_000
    || metrics.materials > 30
    || metrics.maxTextureSize > 2048
    || textureMegabytes > 256
    || metrics.fileBytes > 80 * 1024 * 1024;
  return {
    level: heavy ? 'heavy' : warning ? 'warning' : 'good',
    label: heavy ? '性能风险较高' : warning ? '建议使用性能优先' : '性能规模正常',
    textureMegabytes: Math.round(textureMegabytes),
  };
}

export function createSettingsProfile(settings) {
  return {
    format: 'miao-motion-settings',
    version: 2,
    settings: {
      activeModelId: settings.activeModelId,
      background: settings.background,
      mirror: settings.mirror,
      bodyTracking: settings.bodyTracking,
      outputAspect: settings.outputAspect,
      renderQuality: settings.renderQuality,
      sensitivity: settings.sensitivity,
      smoothing: settings.smoothing,
      viewPreset: settings.viewPreset,
    },
  };
}

export function parseSettingsProfile(raw) {
  try {
    const profile = JSON.parse(raw);
    if (profile?.format !== 'miao-motion-settings' || ![1, 2].includes(profile?.version) || !profile.settings) return null;
    const parsed = parseSettings(JSON.stringify(profile.settings));
    return {
      activeModelId: parsed.activeModelId,
      background: parsed.background,
      mirror: parsed.mirror,
      bodyTracking: parsed.bodyTracking,
      outputAspect: parsed.outputAspect,
      renderQuality: parsed.renderQuality,
      sensitivity: parsed.sensitivity,
      smoothing: parsed.smoothing,
      viewPreset: parsed.viewPreset,
    };
  } catch {
    return null;
  }
}

export function parseDiagnosticEvents(raw, limit = 80) {
  try {
    const events = JSON.parse(raw ?? '[]');
    if (!Array.isArray(events)) return [];
    return events
      .filter((event) => event && typeof event.at === 'string' && typeof event.kind === 'string' && typeof event.message === 'string')
      .slice(-Math.max(1, limit))
      .map((event) => ({
        at: event.at.slice(0, 40),
        kind: event.kind.slice(0, 80),
        message: sanitizeDiagnosticMessage(event.message).slice(0, 300),
      }));
  } catch {
    return [];
  }
}

export function modelLoadErrorMessage(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
  if (/memory|allocation|context lost|too large/.test(message)) {
    return '模型加载失败：内存或显存不足，请关闭其他程序、选择“性能优先”或压缩模型';
  }
  if (/json|unexpected|buffer|range|parse|invalid/.test(message)) {
    return '模型加载失败：文件结构可能损坏，请从建模软件重新导出 VRM';
  }
  if (/vrm/.test(message)) return '模型加载失败：文件中没有有效的 VRM 数据';
  return '模型解析失败：请确认文件完整且为 VRM 0.x/1.0';
}

export function sanitizeDiagnosticMessage(value) {
  const raw = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  return raw
    .replace(/blob:[^\s)]+/gi, 'blob:[redacted]')
    .replace(/file:\/\/[^\n)]*/gi, 'file:[redacted]')
    .replace(/(^|\s)\/\/[^/\s]+\/[^\n)]*/g, '$1[local-path-redacted]')
    .replace(/\\\\[^\\\s]+\\[^\n)]*/g, '[local-path-redacted]')
    .replace(/\b[a-z]:[\\/][^\n)]*/gi, '[local-path-redacted]')
    .replace(/\/(?:Users|home|Volumes|mnt\/[a-z]\/Users)\/[^\n)]*/gi, '[local-path-redacted]');
}

export function coarseUserAgent(userAgent) {
  const match = userAgent.match(/(?:Edg|Chrome|Firefox)\/(\d+)/);
  if (match) return `${match[0].split('/')[0]}/${match[1]}`;
  const safari = userAgent.match(/Version\/(\d+).+Safari\//);
  return safari ? `Safari/${safari[1]}` : 'Unknown browser';
}
