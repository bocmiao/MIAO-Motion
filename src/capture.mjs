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

export function cameraErrorMessage(error, desktop = false) {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return desktop
    ? '没有摄像头权限：请打开 Windows 设置 → 隐私和安全性 → 相机，允许桌面应用访问，然后重启喵动'
    : '没有摄像头权限：请在浏览器地址栏允许后重试；也请检查 Windows 相机隐私设置';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '没有找到所选摄像头：请重新连接或选择其他设备';
  if (name === 'NotReadableError' || name === 'AbortError') return '摄像头正被其他程序占用：关闭占用程序后重试';
  return '摄像头启动失败：请检查设备和权限后重试';
}

export function stopMediaStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function createWithGpuFallback(create, options, onFallback = () => {}) {
  try {
    return await create({ ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } });
  } catch (error) {
    onFallback(error);
    return create({ ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } });
  }
}

/**
 * 推理耗时健康检查：有些设备上 GPU delegate 能创建成功，但推理极慢或持续抛错，
 * 创建期的回退覆盖不到。连续 sampleSize 帧平均耗时超过 slowThresholdMs，
 * 或连续抛错 maxErrors 次时触发一次 onDegrade，由调用方决定如何降级（如重建 CPU 实例）。
 */
export function createInferenceHealthMonitor({ onDegrade, slowThresholdMs = 100, sampleSize = 30, maxErrors = 5 } = {}) {
  let samples = 0, totalMs = 0, errors = 0, degraded = false;
  return {
    get degraded() { return degraded; },
    observe(durationMs) {
      if (degraded || !Number.isFinite(durationMs)) return;
      totalMs += durationMs;
      if (++samples >= sampleSize) {
        const avg = totalMs / samples;
        samples = 0; totalMs = 0;
        if (avg > slowThresholdMs) { degraded = true; onDegrade?.('slow', avg); }
      }
    },
    observeError() {
      if (!degraded && ++errors >= maxErrors) { degraded = true; onDegrade?.('error'); }
    },
    reset() { samples = 0; totalMs = 0; errors = 0; degraded = false; },
  };
}
