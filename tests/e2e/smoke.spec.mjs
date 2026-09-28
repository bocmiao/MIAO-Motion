import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test('零基础入口、键盘导入与本地设置可用', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/MIAO Motion/);
  await expect.poll(() => page.locator('#avatar-canvas').evaluate((canvas) => canvas.width)).toBeGreaterThan(0);
  await expect(page.locator('#onboarding-dialog')).toBeVisible();
  await page.locator('#onboarding-later').click();

  const chooser = page.waitForEvent('filechooser');
  await page.locator('#stage').press('Enter');
  await chooser;

  const advanced = page.locator('.advanced-settings');
  await expect(advanced).not.toHaveAttribute('open', '');
  await page.locator('.advanced-settings > summary').click();
  await page.locator('#mirror-motion').uncheck();
  await page.locator('#sensitivity').fill('1.4');
  await page.locator('.data-tools > summary').click();

  const download = page.waitForEvent('download');
  await page.locator('#export-settings').click();
  await download;

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#reset-settings').click();
  await expect(page.locator('#mirror-motion')).toBeChecked();
  await page.locator('#settings-file').setInputFiles({
    name: 'miao-motion-settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      format: 'miao-motion-settings',
      version: 1,
      settings: { background: 'green', mirror: false, renderQuality: 'performance', sensitivity: 1.4 },
    })),
  });
  await expect(page.locator('#mirror-motion')).not.toBeChecked();
  await page.reload();
  await expect(page.locator('#mirror-motion')).not.toBeChecked();
  await expect(page.locator('#sensitivity')).toHaveValue('1.4');
});

test('IndexedDB v1 模型记录会迁移为 v3 Blob', async ({ page }) => {
  await page.goto('/help.html');
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('miao-motion', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('assets');
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('assets', 'readwrite');
        transaction.objectStore('assets').put({
          name: 'legacy.vrm',
          type: 'model/vrm',
          data: new Uint8Array([1, 2, 3]).buffer,
        }, 'current-vrm');
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open('miao-motion', 3);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('models').objectStore('models').get('current');
      get.onsuccess = () => { resolve(get.result?.data instanceof Blob && get.result?.name === 'legacy.vrm'); db.close(); };
      get.onerror = () => reject(get.error);
    };
    request.onerror = () => reject(request.error);
  }))).toBe(true);
});

test('广播模式在缺少模型时给出可操作反馈', async ({ page }) => {
  await page.goto('/?broadcast=1&background=transparent');
  await expect(page.locator('body')).toHaveClass(/broadcast-mode/);
  await expect(page.locator('#broadcast-status')).toBeVisible();
  await expect(page.locator('#broadcast-status-title')).toHaveText('还没有可用角色');
  await expect(page.locator('#broadcast-import')).toBeVisible();
});

test('摄像头权限等待期间拒绝重复启动', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cameraRequests = 0;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        addEventListener: () => {},
        enumerateDevices: async () => [],
        getUserMedia: () => {
          window.__cameraRequests += 1;
          return new Promise(() => {});
        },
      },
    });
  });
  await page.goto('/');
  await page.locator('#onboarding-later').click();
  await page.locator('#camera-toggle').click();
  await page.locator('#camera-toggle').dispatchEvent('click');
  await expect(page.locator('#camera-toggle')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.__cameraRequests)).toBe(1);
});

test('摄像头权限拒绝后可以再次重试', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cameraRequests = 0;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        addEventListener: () => {},
        enumerateDevices: async () => [],
        getUserMedia: async () => {
          window.__cameraRequests += 1;
          throw new DOMException('denied', 'NotAllowedError');
        },
      },
    });
  });
  await page.goto('/');
  await page.locator('#onboarding-later').click();
  await page.locator('#camera-toggle').click();
  await expect(page.locator('#camera-status')).toContainText('权限');
  await expect(page.locator('#camera-toggle')).toBeEnabled();
  await page.locator('#camera-toggle').click();
  await expect.poll(() => page.evaluate(() => window.__cameraRequests)).toBe(2);
});

test('损坏模型可恢复，最小 VRM 可进入角色库和模型医生', async ({ page }) => {
  await page.goto('/');
  await page.locator('#onboarding-later').click();
  await page.locator('#model-file').setInputFiles(fixture('corrupt-avatar.vrm'));
  await expect(page.locator('#model-status')).toContainText(/文件结构|模型解析失败/);

  await page.locator('#model-file').setInputFiles(fixture('minimal-avatar.vrm'));
  await expect(page.locator('#model-status')).toContainText('模型可用', { timeout: 15_000 });
  await page.locator('.advanced-settings > summary').click();
  await expect(page.locator('#model-library')).not.toHaveValue('');
  await expect(page.locator('#diagnostics')).toContainText('Humanoid 必需骨骼');
  await expect(page.locator('#diagnostics')).toContainText('MIAO Motion contributors');
  await page.locator('#smoothing').fill('1.7');
  await page.locator('#output-aspect').selectOption('9:16');
  await page.locator('#profile-name').fill('自动化竖屏');
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-library')).not.toHaveValue('');
  await page.locator('.data-tools > summary').click();
  const download = page.waitForEvent('download');
  await page.locator('#export-diagnostics').click();
  await download;
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#delete-library-model').click();
  await expect(page.locator('#model-library')).toHaveValue('');
});
