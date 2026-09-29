import { invoke, isTauri } from '@tauri-apps/api/core';

export function setupNativeCamera(canvas: HTMLCanvasElement, ready: () => boolean) {
  const button = document.getElementById('native-camera-toggle') as HTMLButtonElement;
  const status = document.getElementById('native-camera-status')!;
  let active = false, busy = false, installing = false, last = 0, generation = 0;
  const output = document.createElement('canvas'); output.width = 640; output.height = 360;
  const context = output.getContext('2d', { willReadFrequently: true })!;
  const pixels = new Uint8Array(640 * 360 * 3);
  const stop = () => { generation++; active = false; void invoke('native_camera_stop').catch(() => {}); button.textContent = '开始虚拟摄像头输出'; };
  for (const [id, remove] of [['native-camera-install', false], ['native-camera-remove', true]] as const) {
    const control = document.getElementById(id) as HTMLButtonElement;
    control.disabled = !isTauri();
    control.addEventListener('click', async () => {
      if (installing) return;
      installing = true;
      if (remove) stop();
      for (const id of ['native-camera-install', 'native-camera-remove', 'native-camera-toggle']) (document.getElementById(id) as HTMLButtonElement).disabled = true;
      status.textContent = '等待 Windows 权限确认…画面可以继续使用。';
      try { await invoke('native_camera_install', { remove }); status.textContent = remove ? '虚拟摄像头已注销' : '虚拟摄像头已安装，请重新打开接收软件'; }
      catch (error) { status.textContent = String(error); }
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
  return { tick(now: number) {
    if (!active || busy || now - last < 1000 / 15) return;
    last = now; busy = true; const request = generation;
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
    void invoke<boolean>('native_camera_frame', pixels).then(connected => {
      if (active && request === generation) status.textContent = connected ? '接收软件已连接 · 640×360 · 最多 15 帧/秒' : '正在输出，等待接收软件选择 MIAO Motion Camera';
    }).catch(error => { stop(); status.textContent = `输出已停止：${String(error)}`; }).finally(() => { busy = false; });
  } };
}
