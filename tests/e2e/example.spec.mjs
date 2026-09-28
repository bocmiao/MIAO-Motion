import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

test('a beginner loads the bundled real avatar without external network or camera activation', async ({ page }) => {
  test.setTimeout(120_000);
  const external = [];
  await page.route(/^https?:\/\//, route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await page.goto('/');
  await page.locator('#onboarding-next').click();
  await expect(page.locator('#load-example')).toBeEnabled();
  await page.locator('#load-example').click();
  await expect(page.locator('#model-status')).toContainText('兼容性 4/4', { timeout: 60_000 });
  await expect(page.locator('#camera-status')).toHaveText('尚未开启');
  await page.locator('#onboarding-later').click();
  await page.locator('#broadcast-toggle').click();
  const box = await page.locator('#stage').boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  await expect(page.locator('#stage')).toHaveAttribute('data-render-ready', 'true');
  // Poll actual pixels: a status label or arbitrary sleep cannot prove GPU readiness.
  await expect.poll(async () => {
  const png = PNG.sync.read(await page.screenshot());
  let character = 0;
  // Exclude the status/exit overlays at the bottom; they must not count as avatar pixels.
  for (let y = 0; y < 600; y++) for (let x = 0; x < png.width; x++) {
    const offset = (y * png.width + x) * 4;
    const [r, g, b] = png.data.subarray(offset, offset + 3);
    if (!(g > 100 && g > r * 2 && g > b * 2)) character++;
  }
  return character / (png.width * png.height);
  }, { timeout: 60_000, intervals: [100, 250, 500, 1000] }).toBeGreaterThan(0.05);
  await page.screenshot({ path: test.info().outputPath('pixiv-example-broadcast.png') });
  expect(external).toEqual([]);
});
