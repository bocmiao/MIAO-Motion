import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';

async function importAvatar(page, name = 'minimal-avatar.vrm') {
  await page.goto('/');
  await page.locator('#onboarding-later').click();
  await page.locator('#model-file').setInputFiles(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));
  await expect(page.locator('#model-status')).toContainText('模型可用');
  await expect(page.locator('#import-model')).toBeEnabled();
}

for (const name of ['minimal-avatar.vrm', 'minimal-avatar-v0.vrm']) {
  test(`${name}: visible head pixels in all framing presets; broadcast is green and fits`, async ({ page }) => {
    test.setTimeout(120_000);
    await importAvatar(page, name);
    await page.locator('.advanced-settings > summary').click();
    for (const preset of ['head', 'upper', 'full']) {
      await page.locator(`[data-view="${preset}"]`).click();
      await expect.poll(async () => {
        const png = PNG.sync.read(await page.locator('#avatar-canvas').screenshot({ omitBackground: true }));
        let pixels = 0, sumY = 0;
        for (let i = 0; i < png.data.length; i += 4) {
          const [r, g, b, a] = png.data.subarray(i, i + 4);
          if (a > 200 && r > g * 1.5 && r > b * 1.2) { pixels++; sumY += Math.floor(i / 4 / png.width); }
        }
        return pixels / (png.width * png.height) > (preset === 'full' ? 0.005 : 0.05) && sumY / pixels < png.height * 0.55;
      }, { timeout: 30_000 }).toBe(true);
    }
    await page.locator('[data-view="upper"]').click();
    await page.locator('#broadcast-toggle').click();
    await expect(page.locator('#stage')).toHaveAttribute('data-background', 'green');
    await expect.poll(() => page.locator('#stage').boundingBox()).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
    await expect.poll(async () => {
      const png = PNG.sync.read(await page.locator('#avatar-canvas').screenshot());
      let character = 0, green = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        const [r, g, b] = png.data.subarray(i, i + 3);
        if (r > g * 1.5 && r > b * 1.2) character++;
        if (g > 100 && g > r * 2 && g > b * 2) green++;
      }
      return character / (png.width * png.height) > 0.05 && green / (png.width * png.height) > 0.1;
    }, { timeout: 30_000 }).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${name}-broadcast.png`) });
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/broadcast-mode/);
  });
}

test('broadcast aspect ratios fit inside the viewport; transparent corners stay transparent', async ({ page }) => {
  await importAvatar(page);
  await page.locator('.advanced-settings > summary').click();
  for (const [aspect, ratio] of [['16:9', 16 / 9], ['9:16', 9 / 16], ['1:1', 1]]) {
    await page.locator('#output-aspect').selectOption(aspect);
    await page.locator('#broadcast-toggle').click();
    const box = await page.locator('#stage').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280.1); expect(box.y + box.height).toBeLessThanOrEqual(720.1);
    expect(box.width / box.height).toBeCloseTo(ratio, 2);
    await page.keyboard.press('Escape');
  }
  await page.locator('#output-aspect').selectOption('auto');
  await page.locator('#background-toggle').click(); // studio -> green
  await page.locator('#background-toggle').click(); // green -> transparent
  await page.locator('#broadcast-toggle').click();
  await expect(page.locator('#stage')).toHaveAttribute('data-background', 'transparent');
  // Let the transient exit instruction disappear before capturing the actual output.
  await expect(page.locator('#toast')).toBeHidden({ timeout: 5000 });
  const png = PNG.sync.read(await page.screenshot({ omitBackground: true }));
  for (const [x, y] of [[0, 0], [1279, 0], [0, 719], [1279, 719]]) expect(png.data[(y * png.width + x) * 4 + 3]).toBe(0);
});

test('no model or camera is required to finish onboarding; completion persists', async ({ page }) => {
  await page.goto('/');
  await page.locator('#onboarding-next').click();
  await page.locator('#onboarding-skip').click();
  await page.locator('#onboarding-skip-camera').click();
  await page.locator('#onboarding-platform').selectOption('meeting');
  await expect(page.locator('#platform-guide')).toHaveAttribute('href', './platforms.html#meeting');
  await page.locator('#onboarding-next').click();
  await page.reload();
  await expect(page.locator('#onboarding-dialog')).not.toBeVisible();
});

test('single library entry can reload and repeated file import is deduplicated', async ({ page }) => {
  await importAvatar(page);
  await page.locator('.advanced-settings > summary').click();
  const id = await page.locator('#model-library').inputValue();
  await page.locator('#model-file').setInputFiles(fileURLToPath(new URL('../fixtures/minimal-avatar.vrm', import.meta.url)));
  await expect(page.locator('#import-model')).toBeEnabled();
  await expect(page.locator('#model-library option')).toHaveCount(1);
  await expect(page.locator('#model-library')).toHaveValue(id);
  await page.locator('#load-library-model').click();
  await expect(page.locator('#import-model')).toBeEnabled();
  await expect(page.locator('#model-status')).toContainText('模型可用');
});
