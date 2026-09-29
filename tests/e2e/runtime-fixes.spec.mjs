import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import validator from 'gltf-validator';
const fixture = fileURLToPath(new URL('../fixtures/minimal-avatar.vrm', import.meta.url));
const official = await readFile(new URL('../fixtures/ifacialmocap-official.txt', import.meta.url), 'utf8');
const open = async page => { await page.goto('/'); await page.locator('#onboarding-later').click(); };

/** OBS WebSocket v5 mock; `answer(d)` returns a reply {result, responseData, code} or null to stay silent. */
async function mockObs(page, answer) {
  const requests = [];
  await page.routeWebSocket('ws://127.0.0.1:4455', socket => {
    socket.send(JSON.stringify({ op: 0, d: { rpcVersion: 1 } }));
    socket.onMessage(raw => {
      const { op, d } = JSON.parse(raw);
      if (op === 1) { socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } })); return; }
      requests.push(d);
      const reply = answer(d);
      if (!reply) return;
      socket.send(JSON.stringify({ op: 7, d: { requestType: d.requestType, requestId: d.requestId, requestStatus: { result: reply.result !== false, code: reply.code ?? 100, ...(reply.result === false ? { comment: reply.comment ?? 'failed' } : {}) }, responseData: reply.responseData ?? {} } }));
    });
  });
  return requests;
}
const existing = { scenes: [{ sceneName: '喵动 · 绿幕角色', sceneIndex: 0, sceneUuid: 'a' }, { sceneName: '直播主场景', sceneIndex: 1, sceneUuid: 'b' }] };
const existingInputs = { inputs: [{ inputName: '喵动 · 窗口捕获', inputKind: 'window_capture', unversionedInputKind: 'window_capture', inputUuid: 'c' }] };
const listReply = d => d.requestType === 'GetSceneList' ? { responseData: existing } : d.requestType === 'GetInputList' ? { responseData: existingInputs } : null;
const startObs = async page => {
  await open(page);
  await page.locator('#model-file').setInputFiles(fixture);
  await expect(page.locator('#model-status')).toContainText('模型可用');
  await page.getByText('自动配置 OBS（Windows）', { exact: true }).click();
  await page.locator('#setup-obs').click();
};

test('OBS: a create that times out but completes later is still rolled back, and user scenes are never touched', async ({ page }) => {
  // CreateInput never answers within 5 s (OBS busy); the later RemoveInput/RemoveScene succeed.
  const requests = await mockObs(page, d => listReply(d) ?? (d.requestType === 'CreateInput' ? null : {}));
  await startObs(page);
  await expect(page.locator('#obs-setup-status')).toContainText('OBS 操作超时', { timeout: 15_000 });
  await expect(page.locator('#obs-setup-status')).toContainText('本次新增内容已清理');
  expect(requests.map(r => r.requestType)).toEqual(['GetSceneList', 'GetInputList', 'CreateScene', 'CreateInput', 'RemoveInput', 'RemoveScene']);
  expect(requests[2].requestData.sceneName).toBe('喵动 · 绿幕角色 2');
  expect(requests[3].requestData.inputName).toBe('喵动 · 窗口捕获 2');
  expect(requests[4].requestData).toEqual({ inputName: '喵动 · 窗口捕获 2' });
  expect(requests[5].requestData).toEqual({ sceneName: '喵动 · 绿幕角色 2' });
});

test('OBS: names that cannot be removed are listed for manual deletion', async ({ page }) => {
  const requests = await mockObs(page, d => listReply(d) ?? (d.requestType === 'CreateInput' ? null : d.requestType === 'RemoveScene' ? { result: false, code: 600, comment: 'No source was found' } : {}));
  await startObs(page);
  await expect(page.locator('#obs-setup-status')).toContainText('请在 OBS 中检查并手动删除本次新增的场景“喵动 · 绿幕角色 2”', { timeout: 15_000 });
  await expect(page.locator('#obs-setup-status')).not.toContainText('来源“');
  expect(requests.filter(r => r.requestType.startsWith('Remove')).map(r => Object.values(r.requestData)[0])).toEqual(['喵动 · 窗口捕获 2', '喵动 · 绿幕角色 2']);
});

test('OBS: an explicitly refused create (name taken meanwhile) is not "rolled back" onto the user\'s scene', async ({ page }) => {
  const requests = await mockObs(page, d => listReply(d) ?? (d.requestType === 'CreateScene' ? { result: false, code: 601, comment: 'A source already exists by that scene name.' } : {}));
  await startObs(page);
  await expect(page.locator('#obs-setup-status')).toContainText('A source already exists');
  await expect(page.locator('#obs-setup-status')).toContainText('OBS 中没有新增内容');
  expect(requests.map(r => r.requestType)).toEqual(['GetSceneList', 'GetInputList', 'CreateScene']);
});

const tauriMock = () => {
  window.isTauri = true;
  window.__calls = [];
  window.__phoneReply = null;
  window.__component = { registered: true, legacy: true, path_kind: 'legacy' };
  const now = performance.now.bind(performance);
  window.__offset = 0;
  performance.now = () => now() + window.__offset;
  window.__TAURI_INTERNALS__ = { invoke: async (command) => {
    window.__calls.push(command);
    if (command === 'phone_start') return '192.168.1.8';
    if (command === 'phone_poll') return window.__phoneReply;
    if (command === 'native_camera_component_state') {
      if (window.__component === 'missing') throw new Error('Command native_camera_component_state not found');
      return window.__component;
    }
    return null;
  } };
};

test('phone: no packet within 5 s explains the network checks; a head-less packet still drives; a later gap says interrupted', async ({ page }) => {
  await page.addInitScript(tauriMock);
  await open(page);
  await page.getByText('手机面捕（iFacialMocap）', { exact: true }).click();
  await page.locator('#phone-ip').fill('192.168.1.20');
  await page.locator('#phone-toggle').click();
  await expect(page.locator('#phone-status')).toContainText('等待手机');
  await expect.poll(() => page.evaluate(() => window.__calls.filter(c => c === 'phone_poll').length)).toBeGreaterThan(3);
  await expect(page.locator('#phone-status')).not.toContainText('还没有收到手机数据');
  await page.evaluate(() => { window.__offset += 6_000; });
  await expect(page.locator('#phone-status')).toContainText('还没有收到手机数据');
  await expect(page.locator('#phone-status')).toContainText('专用网络');
  await expect(page.locator('#phone-status')).toContainText('AP 隔离');
  // Real official packet minus its =head# field: expressions must still be accepted.
  await page.evaluate(packet => { window.__phoneReply = packet; }, official.replace(/=head#[^|]*\|?/, ''));
  await expect(page.locator('#phone-status')).toContainText('正在接收手机面捕');
  await page.evaluate(() => { window.__phoneReply = null; window.__offset += 2_000; });
  await expect(page.locator('#phone-status')).toContainText('手机信号已中断');
  await expect(page.locator('#phone-status')).not.toContainText('还没有收到手机数据');
});

test('native camera: desktop startup warns about a legacy component; missing command stays silent', async ({ page }) => {
  await page.addInitScript(tauriMock);
  await open(page);
  await expect(page.locator('#native-camera-status')).toHaveText('检测到旧版（v0.3.0 及更早）的虚拟摄像头组件，存在安全风险。请点击“卸载摄像头组件”清理，再重新安装。');
  expect(await page.evaluate(() => window.__calls)).toContain('native_camera_component_state');
  await page.addInitScript(() => { window.__component = 'missing'; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__calls)).toContain('native_camera_component_state');
  await expect(page.locator('#native-camera-status')).not.toContainText('旧版');
  await page.addInitScript(() => { window.__component = { registered: true, legacy: false, path_kind: 'protected' }; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__calls)).toContain('native_camera_component_state');
  await expect(page.locator('#native-camera-status')).not.toContainText('旧版');
});

test('native camera: the portable browser edition never asks for the component state', async ({ page }) => {
  await page.addInitScript(() => {
    window.__ipc = [];
    const original = window.fetch;
    window.fetch = (input, init) => { if (String(input).includes('ipc.localhost')) window.__ipc.push(String(input)); return original(input, init); };
  });
  await open(page);
  await expect(page.locator('#native-camera-status')).toContainText('原生输出需要 Windows 安装版');
  expect(await page.evaluate(() => [window.__ipc, typeof window.__TAURI_INTERNALS__])).toEqual([[], 'undefined']);
});

/** Replaces only the body-tracking worker with a scripted one; `__hangWorkers` workers never answer frames. */
const fakeBodyWorker = hang => {
  window.__hangWorkers = hang;
  window.__bodyWorkers = [];
  const RealWorker = window.Worker;
  window.Worker = function (url, options) {
    if (!String(url).endsWith('/body-worker.js')) return new RealWorker(url, options);
    const index = window.__bodyWorkers.length;
    const fake = { onmessage: null, onerror: null, terminated: false, frames: 0,
      postMessage(message) {
        if (fake.terminated) return;
        if (message.type === 'init') setTimeout(() => fake.onmessage?.({ data: { type: 'ready' } }), 20);
        else if (message.type === 'frame') {
          message.frame.close(); fake.frames++;
          if (index >= window.__hangWorkers) setTimeout(() => { if (!fake.terminated) fake.onmessage?.({ data: { type: 'result', pose: [], hands: [], handedness: [], elapsed: 5 } }); }, 20);
        }
      },
      terminate() { fake.terminated = true; } };
    window.__bodyWorkers.push(fake);
    return fake;
  };
};
const startBody = async page => {
  await open(page);
  await page.locator('.advanced-settings > summary').click();
  await page.locator('#body-tracking').check();
  await page.locator('#camera-toggle').click();
};

test('body tracking: a worker that stops answering is terminated and replaced', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(fakeBodyWorker, 1);
  await startBody(page);
  await expect.poll(() => page.evaluate(() => window.__bodyWorkers[0]?.frames ?? 0), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect(page.locator('#body-status')).toHaveAttribute('data-restarts', '1', { timeout: 10_000 });
  await expect.poll(() => page.locator('#body-status').getAttribute('data-frames'), { timeout: 15_000 }).not.toBe('0');
  expect(await page.evaluate(() => window.__bodyWorkers.map(w => w.terminated))).toEqual([true, false]);
  await expect(page.locator('#body-tracking')).toBeChecked();
});

test('body tracking: repeated silent failures stop body tracking with a visible message', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(fakeBodyWorker, 99);
  await startBody(page);
  await expect(page.locator('#body-status')).toContainText('连续多次没有响应', { timeout: 60_000 });
  await expect(page.locator('#body-status')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#body-tracking')).not.toBeChecked();
  const workers = await page.evaluate(() => window.__bodyWorkers.map(w => ({ terminated: w.terminated, frames: w.frames })));
  expect(workers).toHaveLength(3);
  expect(workers.every(w => w.terminated && w.frames === 1)).toBe(true);
  await expect(page.locator('#camera-status')).not.toHaveText('尚未开启');
});

test('preview stays in view on long desktop pages, scrolls away on phones, and broadcast fills the window', async ({ page }) => {
  await open(page);
  await page.locator('#model-file').setInputFiles(fixture);
  await expect(page.locator('#model-status')).toContainText('模型可用');
  for (const summary of await page.locator('details > summary').all()) if (await summary.isVisible()) await summary.click();
  const card = page.locator('.stage-card');
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(720 * 2);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  let box = await card.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeLessThan(40);
  expect(box.y + box.height).toBeLessThanOrEqual(720);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const top = (await card.boundingBox()).y;
  await page.evaluate(() => window.scrollTo(0, 1600));
  box = await card.boundingBox();
  expect(box.y).toBeLessThan(top - 1000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#broadcast-toggle').click();
  await expect(page.locator('body')).toHaveClass(/broadcast-mode/);
  box = await card.boundingBox();
  expect(await card.evaluate(element => getComputedStyle(element).position)).toBe('static');
  expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, 1280, 720]);
});

test('exported mascot named CON downloads as a Windows-safe, validator-clean VRM and explains authorship', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await page.locator('#quick-miao').click();
  await expect(page.locator('#stage')).toHaveAttribute('data-render-ready', 'true', { timeout: 60_000 });
  await page.locator('.studio-settings > summary').click();
  await page.locator('#cat-name').fill('CON');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#cat-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('CON_.vrm');
  await expect(page.locator('#cat-editor-status')).toContainText('作者仍为喵动项目（原角色许可：VRM 公共许可，允许任何人使用、商用与修改再分发），名字改为你起的名字');
  const report = await validator.validateBytes(new Uint8Array(await readFile(await download.path())), { maxIssues: 0 });
  expect(report.issues.numErrors).toBe(0);
});
