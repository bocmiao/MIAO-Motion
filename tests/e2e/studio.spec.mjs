import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const fixture = fileURLToPath(new URL('../fixtures/minimal-avatar.vrm', import.meta.url));
const open = async page => { await page.goto('/'); await page.locator('#onboarding-later').click(); };

test('original mascot loads with face controls and can be recolored', async ({ page }) => {
  await page.goto('/'); await page.locator('#onboarding-next').click();
  await page.locator('#load-miao').click();
  await expect(page.locator('#model-status')).toContainText('兼容性 4/4');
  await page.locator('#onboarding-later').click();
  await page.locator('.studio-settings > summary').click();
  await page.locator('#expression-preset').selectOption('happy');
  await expect(page.locator('#expression-preset')).toHaveValue('happy');
  await page.locator('#avatar-material').selectOption({ label: '深青色衣服' });
  await page.locator('#avatar-color').fill('#2856b0');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath('mascot-studio.png'), fullPage: true });
  await page.locator('#broadcast-toggle').click();
  await page.screenshot({ path: test.info().outputPath('mascot-broadcast.png') });
});

test('model readiness waits for GPU completion and exposes preparation feedback', async ({ page }) => {
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.clientWaitSync;
    WebGL2RenderingContext.prototype.clientWaitSync = function (...args) {
      if (!window.__releaseGPU) return this.TIMEOUT_EXPIRED;
      return original.apply(this, args);
    };
  });
  await open(page);
  await page.locator('#model-file').setInputFiles(fixture);
  await expect(page.locator('#model-status')).toContainText('正在准备画面');
  await expect(page.locator('#broadcast-toggle')).toBeDisabled();
  await expect(page.locator('#stage')).toHaveAttribute('data-render-ready', 'false');
  await page.evaluate(() => { window.__releaseGPU = true; });
  await expect(page.locator('#model-status')).toContainText('模型可用');
  await expect(page.locator('#stage')).toHaveAttribute('data-render-ready', 'true');
});

test('material colors persist per model and reset; microphone closes every track', async ({ page }) => {
  await page.addInitScript(() => {
    window.__audioStreams = [];
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await get(constraints); if (constraints.audio) window.__audioStreams.push(stream); return stream;
    };
  });
  await open(page);
  await page.locator('#model-file').setInputFiles(fixture);
  await expect(page.locator('#import-model')).toBeEnabled();
  await page.locator('.studio-settings > summary').click();
  await expect(page.locator('#avatar-color')).toBeEnabled();
  const original = await page.locator('#avatar-color').inputValue();
  await page.locator('#avatar-color').fill('#123456');
  await page.reload();
  await expect(page.locator('#model-status')).toContainText('模型可用');
  await page.locator('#onboarding-later').click();
  await page.locator('.studio-settings > summary').click();
  await expect(page.locator('#avatar-color')).toHaveValue('#123456');
  await page.locator('#avatar-color-reset').click();
  await expect(page.locator('#avatar-color')).toHaveValue(original);
  await page.locator('#microphone-toggle').click();
  await expect(page.locator('#microphone-status')).toContainText('已开启');
  await expect(page.locator('#camera-status')).toHaveText('尚未开启');
  await page.locator('#microphone-toggle').click();
  expect(await page.evaluate(() => window.__audioStreams.every(s => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
});

test('download page follows published assets and falls back when offline', async ({ page }) => {
  const tag = 'v8.9.10-beta';
  const assets = ['MIAO.Motion_8.9.10_x64-setup.exe', 'MIAO-Motion-portable.zip'].flatMap(n => [n, `${n}.sha256`]).map(name => ({ name, size: 1234, browser_download_url: `https://github.com/bocmiao/MIAO-Motion/releases/download/${tag}/${name}` }));
  await page.route('https://api.github.com/**', route => route.fulfill({ json: [{ tag_name: tag, assets }] }));
  await page.goto('/download.html');
  await expect(page.locator('#release-status')).toContainText(tag);
  await expect(page.locator('#release-files a')).toHaveCount(4);
  await page.route('https://api.github.com/**', route => route.abort());
  await page.reload();
  await expect(page.locator('#release-status')).toContainText('无法联网');
  await expect(page.getByText('打开官方下载列表')).toBeVisible();
});

test('a model save failure cannot overwrite the previous character color preferences', async ({ page }) => {
  await open(page);
  await page.locator('#model-file').setInputFiles(fixture);
  await expect(page.locator('#import-model')).toBeEnabled();
  await page.locator('.studio-settings > summary').click();
  await page.locator('#avatar-color').fill('#123456');
  const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('miao-appearance-'))));
  await page.evaluate(() => {
    for (const name of ['add', 'put']) {
      const original = IDBObjectStore.prototype[name];
      IDBObjectStore.prototype[name] = function (...args) {
        if (this.name === 'models') throw new DOMException('Injected storage full', 'QuotaExceededError');
        return original.apply(this, args);
      };
    }
  });
  await page.locator('#model-file').setInputFiles(fileURLToPath(new URL('../fixtures/minimal-avatar-v0.vrm', import.meta.url)));
  await expect(page.locator('#toast')).toContainText('空间不足');
  await expect(page.locator('#import-model')).toBeEnabled();
  await page.locator('#avatar-color').fill('#aabbcc');
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('miao-appearance-'))))).toEqual(before);
});

test('offline body and hand engines start and release on camera stop', async ({ page }) => {
  test.setTimeout(90_000);
  const external = [];
  await page.route(/^https?:\/\//, route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await open(page);
  await page.locator('.advanced-settings > summary').click();
  await page.locator('#body-tracking').check();
  await page.locator('#camera-toggle').click();
  await expect(page.locator('#body-status')).toContainText(/身体.*手部/, { timeout: 60_000 });
  await expect(page.locator('#body-tracking')).toBeChecked();
  await page.locator('#camera-toggle').click();
  await expect(page.locator('#body-status')).toHaveText('身体和手部追踪未开启');
  expect(external).toEqual([]);
});

test('OBS setup creates its own window source and green filter through authenticated protocol', async ({ page }) => {
  const requests = [];
  let authentication;
  await page.routeWebSocket('ws://127.0.0.1:4455', socket => {
    socket.send(JSON.stringify({ op: 0, d: { rpcVersion: 1, authentication: { salt: 'test-salt', challenge: 'test-challenge' } } }));
    socket.onMessage(raw => {
      const { op, d } = JSON.parse(raw);
      if (op === 1) { authentication = d.authentication; socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } })); return; }
      requests.push(d);
      const responseData = d.requestType === 'GetInputPropertiesListPropertyItems' ? { propertyItems: [{ itemName: 'MIAO Motion / 喵动', itemValue: 'MIAO Motion / 喵动:Chrome_WidgetWin_1:miao-motion.exe', itemEnabled: true }] } : d.requestType === 'CreateInput' ? { sceneItemId: 42 } : d.requestType === 'GetVideoSettings' ? { baseWidth: 1920, baseHeight: 1080 } : {};
      socket.send(JSON.stringify({ op: 7, d: { requestId: d.requestId, requestStatus: { result: true }, responseData } }));
    });
  });
  await open(page);
  await page.locator('#model-file').setInputFiles(fixture);
  await expect(page.locator('#model-status')).toContainText('模型可用');
  await page.getByText('自动配置 OBS（Windows）', { exact: true }).click();
  await page.locator('#obs-password').fill('test-password');
  await page.locator('#setup-obs').click();
  await expect(page.locator('#obs-setup-status')).toContainText('已创建');
  const hash = text => createHash('sha256').update(text).digest('base64');
  expect(authentication).toBe(hash(hash('test-passwordtest-salt') + 'test-challenge'));
  expect(requests.map(r => r.requestType)).toEqual(['CreateScene', 'CreateInput', 'GetInputPropertiesListPropertyItems', 'SetInputSettings', 'CreateSourceFilter', 'GetVideoSettings', 'SetSceneItemTransform']);
  expect(requests[4].requestData.filterKind).toBe('chroma_key_filter_v2');
  expect(requests[6].requestData.sceneItemTransform.boundsWidth).toBe(1920);
  expect(requests[1].requestData.inputKind).toBe('window_capture');
});

test('native bridge sends bounded binary frames and releases on stop; phone drives without webcam', async ({ page }) => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__nativeFrames = [];
    window.__nativeStops = 0;
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'native_camera_frame') { window.__nativeFrames.push({ length: args.byteLength, bytes: Array.from(args.slice(0,3)) }); return true; }
      if (command === 'native_camera_stop') window.__nativeStops++;
      if (command === 'phone_start') return '192.168.1.1';
      if (command === 'phone_poll') return 'eyeBlinkLeft-20|jawOpen-40|=head#0,5,0,0,0,0|';
      return null;
    } };
  });
  await open(page);
  await page.locator('#model-file').setInputFiles(fixture);
  await expect(page.locator('#model-status')).toContainText('模型可用');
  await page.getByText('原生虚拟摄像头（Windows）', { exact: true }).click();
  await page.locator('#native-camera-toggle').click();
  await expect(page.locator('#native-camera-status')).toContainText('接收软件已连接');
  expect(await page.evaluate(() => window.__nativeFrames[0].length)).toBe(640*360*3);
  await page.locator('#native-camera-toggle').click();
  expect(await page.evaluate(() => window.__nativeStops)).toBeGreaterThan(0);
  await page.getByText('手机面捕（iFacialMocap）', { exact: true }).click();
  await page.locator('#phone-ip').fill('192.168.1.20');
  await page.locator('#phone-toggle').click();
  await expect(page.locator('#phone-status')).toContainText('正在接收手机面捕');
  await expect(page.locator('#camera-status')).toHaveText('尚未开启');
  await page.locator('#phone-toggle').click();
  await expect(page.locator('#phone-status')).toContainText('已停止');
});
