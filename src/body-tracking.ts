import type { VRM } from '@pixiv/three-vrm';
import { createBodySolver, type BodyResult } from './body-solver';

/** A frame without any answer for this long means the worker crashed silently or is stuck. */
export const BODY_FRAME_TIMEOUT_MS = 3_000;
/** Consecutive failed frames (each followed by a fresh worker) before body tracking is switched off. */
export const BODY_MAX_FAILURES = 3;

export function setupBodyTracking(avatar: () => VRM | null, mirror: () => boolean) {
  const toggle = document.getElementById('body-tracking') as HTMLInputElement;
  const status = document.getElementById('body-status')!;
  const solver = createBodySolver(avatar, mirror);
  let worker: Worker | null = null, ready = false, busy = false, generation = 0, next = 0, count = 0, failures = 0;
  let initTimer: ReturnType<typeof setTimeout> | undefined, frameTimer: ReturnType<typeof setTimeout> | undefined;
  const release = () => {
    generation++; clearTimeout(initTimer); clearTimeout(frameTimer);
    worker?.terminate(); worker = null; ready = busy = false;
  };
  const stop = () => {
    release(); solver.reset(); failures = 0;
    status.dataset.state = 'off'; status.dataset.frames = '0'; status.textContent = '身体和手部追踪未开启';
  };
  const fail = (message = '身体追踪无法运行，已停止；可重新勾选重试') => {
    stop(); toggle.checked = false; toggle.dispatchEvent(new Event('change', { bubbles: true })); status.dataset.state = 'error'; status.textContent = message;
  };
  // A frame failed after the engines were ready: replace the worker instead of waiting forever on `busy`.
  const recover = () => {
    if (++failures >= BODY_MAX_FAILURES) { fail('身体识别连续多次没有响应，已停止身体追踪（面部动捕不受影响）；可重新勾选重试'); return; }
    release(); solver.reset();
    status.dataset.restarts = String(Number(status.dataset.restarts ?? 0) + 1);
    start(`身体识别没有响应，正在重启后台识别（第 ${failures} 次）…`);
  };
  const start = (message = '正在后台准备身体与手部识别…') => {
    const request = ++generation;
    status.dataset.state = 'loading'; status.dataset.frames = String(count);
    status.textContent = message;
    const current = new Worker(new URL('./body-worker.js', document.baseURI));
    worker = current;
    initTimer = setTimeout(() => { if (request === generation) fail(); }, 60_000);
    current.onerror = () => { if (request !== generation) return; if (ready) recover(); else fail(); };
    current.onmessage = ({ data }) => {
      if (request !== generation) return;
      if (data.type === 'ready') { clearTimeout(initTimer); ready = true; status.dataset.state = 'ready'; status.textContent = '后台识别已就绪，等待摄像头画面'; }
      else if (data.type === 'result') {
        clearTimeout(frameTimer); busy = false; failures = 0; next = performance.now() + Math.max(100, data.elapsed * 1.5);
        solver.apply(data as BodyResult, performance.now());
        status.dataset.frames = String(++count);
        status.textContent = `身体${data.pose.length ? '已识别' : '未入镜'} · 手部 ${data.hands.length}/2 · 后台识别`;
      } else if (data.type === 'error') { if (ready) recover(); else fail(); }
    };
    current.postMessage({ type: 'init' });
  };
  toggle.addEventListener('change', () => { if (!toggle.checked) stop(); });
  window.addEventListener('pagehide', stop);
  status.dataset.state = 'off';
  return { stop, resetPose: solver.reset, active: () => Boolean(worker), tick(video: HTMLVideoElement, now: number, active: boolean, phoneActive = false) {
    if (!toggle.checked || !active) {
      if (worker) stop();
      // 勾选了身体追踪但没有摄像头画面时不要静默：明确告诉用户缺的是视频源。
      if (toggle.checked && !active) {
        status.dataset.state = 'off';
        status.textContent = phoneActive
          ? '身体追踪需要开启摄像头：当前仅手机面捕，身体追踪未启动'
          : '身体和手部追踪未开启';
      }
      return;
    }
    if (!worker) { count = 0; failures = 0; status.dataset.restarts = '0'; start(); return; }
    if (!ready || busy || now < next || video.readyState < 2 || document.hidden) return;
    busy = true; const request = generation;
    // Watchdog covers frame capture and inference: a silent worker crash or hang must not leave `busy` set.
    frameTimer = setTimeout(() => { if (request === generation && busy) recover(); }, BODY_FRAME_TIMEOUT_MS);
    // 送检分辨率 384px：pose_lite 内部本就是小分辨率推理，512px 只增加
    // createImageBitmap（主线程）与传输开销，对精度几乎无贡献。
    const width = Math.min(384, video.videoWidth), height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
    void createImageBitmap(video, { resizeWidth: width, resizeHeight: height }).then(frame => {
      if (!worker || request !== generation) { frame.close(); return; }
      worker.postMessage({ type: 'frame', frame, now }, [frame]);
    }).catch(() => { if (request === generation) recover(); });
  }};
}
