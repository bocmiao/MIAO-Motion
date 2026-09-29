import { invoke, isTauri } from '@tauri-apps/api/core';
import { createFramePacer, MAX_FPS } from './frame-pacing.mjs';

export const LEGACY_COMPONENT_WARNING = '检测到旧版（v0.3.0 及更早）的虚拟摄像头组件，存在安全风险。请点击“卸载摄像头组件”清理，再重新安装。';
type ComponentState = { registered: boolean; legacy: boolean; path_kind: 'protected' | 'legacy' | 'none' };

export function setupNativeCamera(canvas: HTMLCanvasElement, ready: () => boolean) {
  const button = document.getElementById('native-camera-toggle') as HTMLButtonElement;
  const status = document.getElementById('native-camera-status')!;
  let active = false, busy = false, installing = false, last = 0, generation = 0, sent = 0;
  const pacer = createFramePacer();
  const output = document.createElement('canvas'); output.width = 640; output.height = 360;
  const context = output.getContext('2d', { willReadFrequently: true })!;
  const pixels = new Uint8Array(640 * 360 * 3);
  // Desktop only: warn about a component registered by an old, unprotected install location.
  const checkComponent = async () => {
    if (!isTauri()) return;
    try {
      const state = await invoke<ComponentState>('native_camera_component_state');
      if (state?.legacy === true) status.textContent = LEGACY_COMPONENT_WARNING;
    } catch { /* Older desktop builds lack this command; the rest of the panel keeps working. */ }
  };
  const stop = () => { generation++; active = false; pacer.reset(); void invoke('native_camera_stop').catch(() => {}); button.textContent = '开始虚拟摄像头输出'; };
  for (const [id, remove] of [['native-camera-install', false], ['native-camera-remove', true]] as const) {
    const control = document.getElementById(id) as HTMLButtonElement;
    control.disabled = !isTauri();
    control.addEventListener('click', async () => {
      if (installing) return;
      installing = true;
      if (remove) stop();
      for (const id of ['native-camera-install', 'native-camera-remove', 'native-camera-toggle']) (document.getElementById(id) as HTMLButtonElement).disabled = true;
      status.textContent = '等待 Windows 权限确认…画面可以继续使用。';
      try {
        await invoke('native_camera_install', { remove }); status.textContent = remove ? '虚拟摄像头已注销' : '虚拟摄像头已安装，请重新打开接收软件';
        await checkComponent();
      } catch (error) { status.textContent = String(error); }
      finally {
        installing = false;
        for (const id of ['native-camera-install', 'native-camera-remove', 'native-camera-toggle']) (document.getElementById(id) as HTMLButtonElement).disabled = false;
      }
    });
  }
  button.disabled = !isTauri();
  if (!isTauri()) status.textContent = '原生输出需要 Windows 安装版；便携浏览器版可使用 OBS。';
  button.addEventListener('click', async () => {
    if (active) { stop(); status.textContent = '虚拟摄像头输出已停止'; return; }
    if (!ready()) { status.textContent = '请先加载角色并等待画面准备好'; return; }
    const request = ++generation; button.disabled = true;
    try {
      await invoke('native_camera_start');
      if (request !== generation) { void invoke('native_camera_stop'); return; }
      active = true; button.textContent = '停止虚拟摄像头输出';
      status.textContent = '发送器已开启，请在接收软件选择 MIAO Motion Camera';
    } catch (error) { status.textContent = String(error); }
    finally { button.disabled = false; }
  });
  window.addEventListener('pagehide', stop);
  void checkComponent();
  return { tick(now: number) {
    if (!active || busy || now - last < pacer.interval) return;
    last = now; busy = true; const request = generation;
    const started = performance.now();
    context.fillStyle = document.getElementById('stage')?.dataset.background === 'green' ? '#00ff00' : '#e8e8f0';
    context.fillRect(0, 0, 640, 360);
    if (ready()) {
      const scale = Math.min(640 / canvas.width, 360 / canvas.height);
      const width = canvas.width * scale, height = canvas.height * scale;
      context.drawImage(canvas, (640 - width) / 2, (360 - height) / 2, width, height);
    }
    const rgba = context.getImageData(0, 0, 640, 360).data;
    for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
      const source = (y * 640 + x) * 4, dest = (y * 640 + x) * 3;
      pixels[dest] = rgba[source + 2]!; pixels[dest + 1] = rgba[source + 1]!; pixels[dest + 2] = rgba[source]!;
    }
    pacer.record(performance.now() - started);
    void invoke<boolean>('native_camera_frame', pixels).then(connected => {
      if (!active || request !== generation) return;
      // Exposed for diagnostics and the installed-app test, which waits for new frames after a change.
      status.dataset.frames = String(++sent);
      const rate = pacer.fps < MAX_FPS ? `${pacer.fps} 帧/秒（电脑较忙，已自动降低帧率保持界面流畅）` : `${MAX_FPS} 帧/秒`;
      status.textContent = connected ? `接收软件已连接 · 640×360 · ${rate}` : `正在输出，等待接收软件选择 MIAO Motion Camera · ${rate}`;
    }).catch(error => { stop(); status.textContent = `输出已停止：${String(error)}`; }).finally(() => { busy = false; });
  } };
}
