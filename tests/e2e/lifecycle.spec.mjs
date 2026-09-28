import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const fixture = fileURLToPath(new URL('../fixtures/minimal-avatar.vrm', import.meta.url));

test('detector failure closes stream, retry builds a fresh detector, unplug updates UI', async ({ page }) => {
  await page.addInitScript(() => {
    window.__streams = [];
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async c => { const s = await get(c); window.__streams.push(s); return s; };
  });
  await page.route('**/assets/vision_bundle-*.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const FilesetResolver = { forVisionTasks: async () => ({}) };
    export const FaceLandmarker = { createFromOptions: async () => {
      window.__detectors = (window.__detectors || 0) + 1;
      return { close() { window.__closed = (window.__closed || 0) + 1; }, detectForVideo() {
        if (window.__failDetector) throw new Error('injected detector failure');
        return { faceBlendshapes: [], facialTransformationMatrixes: [] };
      } };
    } };` }));
  await page.goto('/'); await page.locator('#onboarding-later').click();
  await page.locator('#camera-toggle').click();
  await expect(page.locator('#camera-status')).toContainText('已开启');
  await page.evaluate(() => { window.__failDetector = true; });
  await expect(page.locator('#camera-status')).toContainText('动捕处理失败');
  expect(await page.evaluate(() => window.__streams[0].getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  expect(await page.evaluate(() => window.__closed)).toBe(1);
  await page.evaluate(() => { window.__failDetector = false; });
  await page.locator('#camera-toggle').click();
  await expect(page.locator('#camera-status')).toContainText('已开启');
  expect(await page.evaluate(() => window.__detectors)).toBe(2);
  await page.evaluate(() => { const t = window.__streams[1].getVideoTracks()[0]; t.stop(); t.dispatchEvent(new Event('ended')); });
  await expect(page.locator('#camera-status')).toContainText('已断开');
  await expect(page.locator('#camera-toggle')).toHaveText('开启摄像头');
});

for (const delayed of ['loader', 'storage']) {
  test(`latest model wins when ${delayed} finishes out of order`, async ({ page }) => {
    await page.addInitScript(mode => {
      if (mode === 'loader') {
        const original = window.fetch;
        window.fetch = async (...args) => {
          const result = await original(...args);
          const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
          if (url?.startsWith('blob:') && !window.__delayed) { window.__delayed = true; await new Promise(r => setTimeout(r, 600)); }
          return result;
        };
      } else {
        const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
        Object.defineProperty(IDBTransaction.prototype, 'oncomplete', { ...descriptor, set(handler) {
          const delay = this.mode === 'readwrite' && !window.__delayed;
          if (delay) window.__delayed = true;
          descriptor.set.call(this, delay ? event => setTimeout(() => handler.call(this, event), 600) : handler);
        } });
      }
    }, delayed);
    await page.goto('/'); await page.locator('#onboarding-later').click();
    await page.locator('#model-file').setInputFiles(fixture);
    await expect.poll(() => page.evaluate(() => Boolean(window.__delayed))).toBe(true);
    await page.locator('#model-file').setInputFiles({ name: 'newest.vrm', mimeType: 'model/vrm', buffer: await readFile(fixture) });
    await expect(page.locator('#model-name')).toHaveText('newest');
    await expect(page.locator('#import-model')).toBeEnabled();
    await page.waitForTimeout(750); // Deliberately wait past the injected stale completion.
    await expect(page.locator('#model-name')).toHaveText('newest');
    const active = await page.evaluate(() => JSON.parse(localStorage.getItem('miao-motion-settings-v1')).activeModelId);
    await expect(page.locator('#model-library')).toHaveValue(active);
    await page.reload();
    await expect(page.locator('#model-name')).toHaveText('newest');
  });
}

test('deleting the old model cannot clear a newer import after delayed completion', async ({ page }) => {
  await page.goto('/'); await page.locator('#onboarding-later').click();
  await page.locator('#model-file').setInputFiles(fixture);
  await expect(page.locator('#import-model')).toBeEnabled();
  await expect(page.locator('#model-status')).toContainText('模型可用');
  await page.locator('.advanced-settings > summary').click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (...args) {
      this.transaction.__delayDelete = true;
      return original.apply(this, args);
    };
    const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', { ...descriptor, set(handler) {
      const delay = this.__delayDelete;
      descriptor.set.call(this, delay ? event => { window.__deleting = true; setTimeout(() => handler.call(this, event), 1000); } : handler);
    } });
  });
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#delete-library-model').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__deleting))).toBe(true);
  await page.locator('#model-file').setInputFiles({ name: 'newest.vrm', mimeType: 'model/vrm', buffer: await readFile(fixture) });
  await expect(page.locator('#model-name')).toHaveText('newest');
  await expect(page.locator('#import-model')).toBeEnabled();
  await page.waitForTimeout(1200);
  await expect(page.locator('#model-name')).toHaveText('newest');
  await expect(page.locator('#broadcast-toggle')).toBeEnabled();
});
