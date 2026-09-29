import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

// CI only: connect to the installed app's WebView2, not a browser preview.
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages()[0];
page.setDefaultTimeout(60_000);
mkdirSync('test-results', { recursive: true });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (['warning','error'].includes(message.type())) errors.push(message.text()); });
const capture = file => new Promise((resolve, reject) => {
  const process = spawn('ffmpeg', ['-hide_banner', '-y', '-f', 'dshow', '-video_size', '640x360',
    '-i', 'video=MIAO Motion Camera', '-frames:v', '1', '-update', '1', file], { stdio: 'inherit', windowsHide: true });
  const timeout = setTimeout(() => { process.kill(); reject(new Error('DirectShow capture timed out')); }, 30_000);
  process.once('error', reject);
  process.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error('DirectShow capture failed')); });
});
try {
  await page.locator('#onboarding-next').click();
  await page.locator('#load-miao').click();
  await expect(page.locator('#stage')).toHaveAttribute('data-render-ready', 'true', { timeout: 60_000 });
  await page.locator('#onboarding-later').click();
  await page.locator('.studio-settings > summary').click();
  await page.locator('#avatar-material').selectOption({ label: '深青色衣服' });
  await page.getByText('原生虚拟摄像头（Windows）', { exact: true }).click();
  await page.locator('#native-camera-install').click();
  await expect(page.locator('#native-camera-status')).toContainText('虚拟摄像头已安装');
  await page.locator('#background-toggle').click();
  await page.locator('#native-camera-toggle').click();
  await expect(page.locator('#native-camera-status')).toContainText('正在输出', { timeout: 15_000 });
  const frames = [];
  for (const [name, color] of [['red', '#ff0000'], ['blue', '#0000ff']]) {
    await page.bringToFront().catch(error => console.warn('WebView2 foreground request:', String(error)));
    // Record whether the page is still producing frames; a paused page cannot feed the camera either.
    const pageState = await page.evaluate(() => new Promise(resolve => {
      const timer = setTimeout(() => resolve({ visibility: document.visibilityState, animationFrame: false }), 2000);
      requestAnimationFrame(() => { clearTimeout(timer); resolve({ visibility: document.visibilityState, animationFrame: true }); });
    }));
    console.log('WebView2 page state before ' + name + ':', pageState);
    // Set the value directly: Playwright's fill polls actionability on animation frames, which WebView2
    // can pause for a covered CI window. The red-to-blue pixel assertion below still proves the change
    // reached the DirectShow receiver.
    await page.locator('#avatar-color').evaluate((input, value) => {
      if (input.disabled) throw new Error('颜色控件处于禁用状态，换色没有选中材质');
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, color);
    // Wait for a changed rendered frame before the receiver opens.
    await page.waitForTimeout(1000);
    const path = 'test-results/desktop-camera-' + name + '.png';
    await capture(path);
    frames.push(PNG.sync.read(readFileSync(path)));
  }
  let redToBlue = 0, green = 0;
  for (let i = 0; i < frames[0].data.length; i += 4) {
    const a = frames[0].data, b = frames[1].data;
    if (a[i] > a[i+2] + 50 && b[i+2] > b[i] + 50) redToBlue++;
    if (a[i+1] > 180 && a[i] < 50 && a[i+2] < 50) green++;
  }
  assert.ok(redToBlue > 100, 'Avatar clothing changes must reach the real DirectShow receiver');
  assert.ok(green > 1000, 'Green stage must reach the real DirectShow receiver');
  console.log('Installed app → rendered avatar → Tauri IPC → DirectShow receiver verified.', { redToBlue, green });
  await page.bringToFront().catch(error => console.warn('WebView2 foreground request:', String(error)));
  // Invoke the real UI handler directly, without animation-frame selector
  // polling in a WebView2 window that the receiver may have occluded.
  await page.evaluate(() => document.getElementById('native-camera-toggle').click());
  await expect(page.locator('#native-camera-toggle')).toContainText('开始', { timeout: 10_000 });
  console.log('Native output stop handler completed.');
} catch (error) {
  console.error('Installed app verification failed:', error);
  const state = await page.evaluate(() => ({ nativeStatus: document.getElementById('native-camera-status')?.textContent,
    button: document.getElementById('native-camera-toggle')?.textContent, stage: document.getElementById('stage')?.dataset.renderReady })).catch(() => null);
  console.error('Installed app diagnostics', state, errors);
  writeFileSync('test-results/desktop-camera-diagnostics.json', JSON.stringify({ error: String(error), state, errors }, null, 2));
  await page.screenshot({ path: 'test-results/desktop-camera-failure.png', timeout: 5000 }).catch(() => {});
  throw error;
} finally { await browser.close(); }
