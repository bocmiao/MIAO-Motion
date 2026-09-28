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
