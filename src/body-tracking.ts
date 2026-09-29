import type { VRM } from '@pixiv/three-vrm';
import { createBodySolver, type BodyResult } from './body-solver';

export function setupBodyTracking(avatar: () => VRM | null, mirror: () => boolean) {
  const toggle = document.getElementById('body-tracking') as HTMLInputElement;
  const status = document.getElementById('body-status')!;
  const solver = createBodySolver(avatar, mirror);
  let worker: Worker | null = null, ready = false, busy = false, generation = 0, next = 0, count = 0;
  let initTimer: ReturnType<typeof setTimeout>;
  const stop = () => {
    generation++; clearTimeout(initTimer); worker?.terminate(); worker = null; ready = busy = false; solver.reset();
    status.dataset.state = 'off'; status.dataset.frames = '0'; status.textContent = '身体和手部追踪未开启';
  };
  const fail = () => { stop(); toggle.checked = false; status.dataset.state = 'error'; status.textContent = '身体追踪无法运行，已停止；可重新勾选重试'; };
  const start = () => {
    const request = ++generation;
    status.dataset.state = 'loading'; status.dataset.frames = '0'; count = 0;
    status.textContent = '正在后台准备身体与手部识别…';
    worker = new Worker(new URL('./body-worker.js', document.baseURI));
    initTimer = setTimeout(fail, 60_000);
    worker.onerror = fail;
    worker.onmessage = ({ data }) => {
      if (request !== generation) return;
      if (data.type === 'ready') { clearTimeout(initTimer); ready = true; status.dataset.state = 'ready'; status.textContent = '后台识别已就绪，等待摄像头画面'; }
      else if (data.type === 'result') {
        busy = false; next = performance.now() + Math.max(100, data.elapsed * 1.5);
        solver.apply(data as BodyResult, performance.now());
        status.dataset.frames = String(++count);
        status.textContent = `身体${data.pose.length ? '已识别' : '未入镜'} · 手部 ${data.hands.length}/2 · 后台识别`;
      } else if (data.type === 'error') fail();
    };
    worker.postMessage({ type: 'init' });
  };
  toggle.addEventListener('change', () => { if (!toggle.checked) stop(); });
  window.addEventListener('pagehide', stop);
  status.dataset.state = 'off';
  return { stop, resetPose: solver.reset, active: () => Boolean(worker), tick(video: HTMLVideoElement, now: number, active: boolean) {
    if (!toggle.checked || !active) { if (worker) stop(); return; }
    if (!worker) { start(); return; }
    if (!ready || busy || now < next || video.readyState < 2 || document.hidden) return;
    busy = true; const request = generation;
    const width = Math.min(512, video.videoWidth), height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
    void createImageBitmap(video, { resizeWidth: width, resizeHeight: height }).then(frame => {
      if (!worker || request !== generation) { frame.close(); return; }
      worker.postMessage({ type: 'frame', frame, now }, [frame]);
    }).catch(() => { if (request === generation) fail(); });
  }};
}
