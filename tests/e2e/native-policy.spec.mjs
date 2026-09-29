import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../..', import.meta.url));
const sendFrame = page => page.evaluate(async () => {
  try {
    const response = await fetch('http://ipc.localhost/native_camera_frame', {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Uint8Array([0,128,255]),
    });
    return await response.json();
  } catch (error) { return `blocked: ${error}`; }
});
const routeIpc = async (page, received) => page.route('http://ipc.localhost/**', route => {
  const request = route.request();
  if (request.method() === 'POST') received.push({ type: request.headers()['content-type'], body: [...request.postDataBuffer()] });
  return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, contentType: 'application/json', body: 'true' });
});

test('portable (browser) build does not allow the desktop IPC endpoint', async ({ page }) => {
  const received = [], violations = [];
  await routeIpc(page, received);
  await page.goto('/');
  await page.evaluate(() => document.addEventListener('securitypolicyviolation', e => { window.__csp = [...(window.__csp ?? []), e.blockedURI]; }));
  const result = await sendFrame(page);
  expect(String(result)).toContain('blocked');
  expect(received).toEqual([]);
  violations.push(...await page.evaluate(() => window.__csp ?? []));
  expect(violations.some(uri => uri.startsWith('http://ipc.localhost'))).toBe(true);
});

test('desktop (Tauri) build keeps the exact local binary IPC endpoint', async ({ page }) => {
  test.setTimeout(120_000);
  const outDir = await mkdtemp(join(tmpdir(), 'miao-desktop-build-'));
  const previous = process.env.TAURI_ENV_PLATFORM;
  try {
    // Tauri CLI exports TAURI_ENV_PLATFORM to beforeBuildCommand; reproduce that for one build.
    process.env.TAURI_ENV_PLATFORM = 'windows';
    await build({ root, configFile: join(root, 'vite.config.mjs'), base: '/desktop-build/', publicDir: false, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  } finally {
    if (previous === undefined) delete process.env.TAURI_ENV_PLATFORM; else process.env.TAURI_ENV_PLATFORM = previous;
  }
  try {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    await page.route('**/desktop-build/**', async route => {
      const path = new URL(route.request().url()).pathname.replace('/desktop-build/', '') || 'index.html';
      try { return route.fulfill({ body: await readFile(join(outDir, path)), contentType: types[extname(path)] ?? 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404 }); }
    });
    const received = [];
    await routeIpc(page, received);
    await page.goto('/desktop-build/index.html');
    expect(await sendFrame(page)).toBe(true);
    expect(received).toEqual([{ type: 'application/octet-stream', body: [0,128,255] }]);
  } finally { await rm(outDir, { recursive: true, force: true }); }
});
