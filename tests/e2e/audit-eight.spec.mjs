import { test, expect } from '@playwright/test';

test('finish creates one persistent character, resumes onboarding, and updates the same entry', async ({ page }) => {
  await page.goto('/');
  await page.locator('#onboarding-next').click();
  await page.locator('#onboarding-create').click();
  await page.locator('#creator-name').fill('布丁猫');
  await page.locator('#creator-close').click();
  await expect(page.locator('#character-creator')).not.toBeVisible();
  await expect(page.locator('[data-onboarding-panel="2"]')).toBeVisible();
  await expect(page.locator('#onboarding-model-state')).toContainText('布丁猫');
  const id = await page.locator('#model-library').inputValue();
  expect(id).not.toBe('');
  const count = await page.locator('#model-library option').count();
  await page.locator('#onboarding-later').click();
  await page.reload();
  await expect(page.locator('#onboarding-dialog')).not.toBeVisible();
  await expect(page.locator('#model-name')).toHaveText('布丁猫');
  await page.locator('#create-character').click();
  await page.locator('#creator-name').fill('布丁猫改名');
  await page.locator('#creator-close').click();
  await expect(page.locator('#character-creator')).not.toBeVisible();
  await expect(page.locator('#model-library')).toHaveValue(id);
  await expect(page.locator('#model-library option')).toHaveCount(count);
  await page.reload();
  await expect(page.locator('#model-name')).toHaveText('布丁猫改名');
});

test('explicit discard restores the previous character without adding a library entry', async ({ page }) => {
  await page.goto('/'); await page.locator('#onboarding-later').click();
  await page.locator('#quick-miao').click();
  await expect(page.locator('#stage')).toHaveAttribute('data-render-ready', 'true');
  const id = await page.locator('#model-library').inputValue();
  const name = await page.locator('#model-name').textContent();
  const count = await page.locator('#model-library option').count();
  await page.locator('#create-character').click();
  await page.locator('#creator-name').fill('不保存这只');
  await page.locator('#creator-discard').click();
  await expect(page.locator('#character-creator')).not.toBeVisible();
  await expect(page.locator('#model-name')).toHaveText(name);
  await expect(page.locator('#model-library')).toHaveValue(id);
  await expect(page.locator('#model-library option')).toHaveCount(count);
});

test('native output renders real small-target pixels and reports slow delivery honestly', async ({ page }) => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__frames = [];
    window.__TAURI_INTERNALS__ = { invoke: async (command, pixels) => {
      if (command === 'native_camera_frame') {
        let green = 0, other = 0;
        for (let i = 0; i < pixels.length; i += 3) {
          if (pixels[i+1] > 180 && pixels[i] < 50 && pixels[i+2] < 50) green++; else other++;
        }
        await new Promise(resolve => setTimeout(resolve, 600));
        window.__frames.push({ time: performance.now(), length: pixels.length, green, other });
        return true;
      }
      return null;
    }};
  });
  await page.goto('/'); await page.locator('#onboarding-later').click();
  await page.locator('#quick-miao').click();
  await expect(page.locator('#stage')).toHaveAttribute('data-render-ready', 'true');
  await page.locator('#background-toggle').click();
  await page.getByText('原生虚拟摄像头（Windows）', { exact: true }).click();
  await page.locator('#native-camera-toggle').click();
  await expect.poll(() => page.evaluate(() => window.__frames.length)).toBeGreaterThanOrEqual(4);
  const frames = await page.evaluate(() => window.__frames);
  expect(frames.every(frame => frame.length === 640 * 360 * 3 && frame.green > 1000 && frame.other > 100)).toBe(true);
  const shown = Number(await page.locator('#native-camera-status').getAttribute('data-fps'));
  expect(shown).toBeGreaterThan(0); expect(shown).toBeLessThan(1.7);
  await page.locator('#native-camera-toggle').click({ timeout: 5000 });
  await expect(page.locator('#native-camera-status')).toContainText('已停止');
});
