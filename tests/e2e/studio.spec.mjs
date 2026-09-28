import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('../fixtures/minimal-avatar.vrm', import.meta.url));
const open = async page => { await page.goto('/'); await page.locator('#onboarding-later').click(); };

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
  await page.routeWebSocket('ws://127.0.0.1:4455', socket => {
    socket.send(JSON.stringify({ op: 0, d: { rpcVersion: 1 } }));
    socket.onMessage(raw => {
      const { op, d } = JSON.parse(raw);
      if (op === 1) { socket.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } })); return; }
      requests.push(d);
      socket.send(JSON.stringify({ op: 7, d: { requestId: d.requestId, requestStatus: { result: true }, responseData: d.requestType === 'GetInputPropertiesListPropertyItems' ? { propertyItems: [{ itemName: 'MIAO Motion / 喵动', itemValue: 'MIAO Motion / 喵动:Chrome_WidgetWin_1:miao-motion.exe', itemEnabled: true }] } : {} } }));
    });
  });
  await open(page);
  await page.locator('#model-file').setInputFiles(fixture);
  await expect(page.locator('#model-status')).toContainText('模型可用');
  await page.getByText('自动配置 OBS（Windows）', { exact: true }).click();
  await page.locator('#setup-obs').click();
  await expect(page.locator('#obs-setup-status')).toContainText('已创建');
  expect(requests.map(r => r.requestType)).toEqual(['CreateScene', 'CreateInput', 'GetInputPropertiesListPropertyItems', 'SetInputSettings', 'CreateSourceFilter']);
  expect(requests.at(-1).requestData.filterKind).toBe('chroma_key_filter_v2');
  expect(requests[1].requestData.inputKind).toBe('window_capture');
});
