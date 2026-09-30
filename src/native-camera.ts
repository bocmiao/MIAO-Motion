import { invoke, isTauri } from '@tauri-apps/api/core';
import { createFramePacer, MAX_FPS } from './frame-pacing.mjs';
import { createNativeFrame } from './native-frame';
import type { Camera, Scene, WebGLRenderer } from 'three';

export const LEGACY_COMPONENT_WARNING = '检测到旧版（v0.3.0 及更早）的虚拟摄像头组件，存在安全风险。请点击“卸载摄像头组件”清理，再重新安装。';
type ComponentState = { registered: boolean; legacy: boolean; path_kind: 'protected' | 'legacy' | 'none' };

export function setupNativeCamera(renderer: WebGLRenderer, scene: Scene, camera: Camera, ready: () => boolean) {
  const button = document.getElementById('native-camera-toggle') as HTMLButtonElement;
  const status = document.getElementById('native-camera-status')!;
  let active = false, busy = false, installing = false, last = 0, generation = 0, sent = 0;
  const pacer = createFramePacer();
  const output = createNativeFrame(renderer, scene, camera);
  // Desktop only: warn about a component registered by an old, unprotected install location.
  const checkComponent = async () => {
    if (!isTauri()) return;
    try {
      const state = await invoke<ComponentState>('native_camera_component_state');
      if (state?.legacy === true) status.textContent = LEGACY_COMPONENT_WARNING;
    } catch { /* Older desktop builds lack this command; the rest of the panel keeps working. */ }
  };
  const stop = async () => {
    generation++; active = false; pacer.reset(); button.disabled = true;
    button.textContent = '正在停止虚拟摄像头…';
    try { await invoke('native_camera_stop'); }
    finally { button.textContent = '开始虚拟摄像头输出'; button.disabled = installing; }
  };
  for (const [id, remove] of [['native-camera-install', false], ['native-camera-remove', true]] as const) {
    const control = document.getElementById(id) as HTMLButtonElement;
    control.disabled = !isTauri();
    control.addEventListener('click', async () => {
      if (installing) return;
      installing = true;
      for (const id of ['native-camera-install', 'native-camera-remove', 'native-camera-toggle']) (document.getElementById(id) as HTMLButtonElement).disabled = true;
      status.textContent = '等待 Windows 权限确认…画面可以继续使用。';
      try {
        if (remove) await stop();
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
    if (active) {
      status.textContent = '正在等待摄像头组件停止…';
      try { await stop(); status.textContent = '虚拟摄像头输出已停止'; }
      catch (error) { status.textContent = `停止失败：${String(error)}`; }
      return;
    }
    if (!ready()) { status.textContent = '请先加载角色并等待画面准备好'; return; }
    const request = ++generation; button.disabled = true;
    try {
      await invoke('native_camera_start');
      if (request !== generation) { void invoke('native_camera_stop'); return; }
      active = true; sent = 0; status.dataset.frames = '0'; pacer.reset(); button.textContent = '停止虚拟摄像头输出';
      status.textContent = '发送器已开启，请在接收软件选择 MIAO Motion Camera';
    } catch (error) { status.textContent = String(error); }
    finally { button.disabled = false; }
  });
  window.addEventListener('pagehide', () => { void stop().catch(() => {}); });
  void checkComponent();
  return { tick(now: number) {
    if (!active || busy || now - last < pacer.interval) return;
    last = now; busy = true; const request = generation;
    const started = performance.now();
    const capture = output.capture(document.getElementById('stage')?.dataset.background === 'green');
    const captureCost = performance.now() - started;
    void capture.then(pixels => {
      if (!active || request !== generation) return false;
      return invoke<boolean>('native_camera_frame', pixels);
    }).then(connected => {
      if (!active || request !== generation) return;
      const completed = performance.now();
      pacer.record(captureCost, completed - started, completed);
      // Exposed for diagnostics and the installed-app test, which waits for new frames after a change.
      status.dataset.frames = String(++sent);
      status.dataset.elapsed = String(Math.round(completed - started));
      status.dataset.fps = String(pacer.deliveredFps ?? 0);
      const rate = pacer.deliveredFps === null ? '正在测量帧率' : `实际 ${pacer.deliveredFps.toFixed(1)} 帧/秒（上限 ${MAX_FPS}）`;
      status.textContent = connected ? `接收软件已连接 · 640×360 · ${rate}` : `正在输出，等待接收软件选择 MIAO Motion Camera · ${rate}`;
    }).catch(async error => { if (request === generation) { await stop().catch(() => {}); status.textContent = `输出已停止：${String(error)}`; } }).finally(() => { busy = false; });
  } };
}
