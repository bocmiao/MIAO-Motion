import { expect as baseExpect } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const expect = baseExpect.configure({ timeout: 30_000 });

const helper = (script, args) => new Promise((resolve, reject) => {
  const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { windowsHide: true, stdio: 'inherit' });
  const timeout = setTimeout(() => { child.kill(); reject(new Error(`${script} timed out`)); }, 70_000);
  child.once('error', reject);
  child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`${script}: ${code}`)); });
});
export async function checkDesktopIO(page) {
  const root = page.url();
  // Click every original target=_blank link, including ones inside collapsed guidance.
  const links = await page.locator('a[target="_blank"]').evaluateAll(items => items.map(link => ({ href: link.href, text: link.textContent })));
  assert.ok(links.length >= 10);
  for (const { href } of links) {
    await page.evaluate(href => [...document.querySelectorAll('a')].find(link => link.href === href).click(), href);
    if (new URL(href).origin === new URL(root).origin) {
      await expect(page.locator('#help-dialog')).toBeVisible();
      await expect(page.locator('#help-frame')).toHaveAttribute('src', href);
      await expect.poll(() => page.locator('#help-frame').evaluate((frame, href) => frame.contentDocument?.URL === href && (frame.contentDocument.body?.textContent?.length ?? 0) > 20, href)).toBe(true);
      await page.locator('#help-close').click();
    } else {
      await expect(page.locator('#toast')).toContainText('系统浏览器');
      await helper('scripts/desktop-foreground.ps1', []);
    }
    assert.equal(page.url(), root, 'Help must not unload the running application');
  }
  assert.equal(await page.evaluate(async () => {
    try { await window.__TAURI_INTERNALS__.invoke('open_external', { url: 'https://example.com/untrusted' }); return false; } catch { return true; }
  }), true, 'Rust must reject a non-allowlisted URL');
  await expect(page.locator('#load-miao')).toBeEnabled();
  await expect(page.locator('#cat-editor')).toBeEnabled();
  const directory = await mkdtemp(join(tmpdir(), 'miao-exports-'));
  for (const [button, name] of [['cat-export', 'cat.vrm'], ['export-settings', 'settings.json'], ['export-diagnostics', 'diagnostics.json']]) {
    const destination = join(directory, name);
    await Promise.all([
      helper('scripts/desktop-dialog.ps1', ['-Destination', destination]),
      page.locator('#' + button).evaluate(button => button.click()),
    ]);
    await expect.poll(async () => (await readFile(destination).catch(() => Buffer.alloc(0))).length).toBeGreaterThan(0);
    const bytes = await readFile(destination);
    if (name.endsWith('.vrm')) assert.equal(bytes.readUInt32LE(0), 0x46546c67); else JSON.parse(bytes.toString());
    await expect(page.locator(button === 'cat-export' ? '#cat-editor-status' : '#toast')).toContainText(button === 'cat-export' ? '已导出' : '文件已保存');
  }
  await Promise.all([helper('scripts/desktop-dialog.ps1', ['-Cancel']), page.locator('#export-settings').evaluate(button => button.click())]);
  await expect(page.locator('#toast')).toContainText('已取消保存');
  // Real OLE/Windows mouse drag, not a synthetic DOM event or setInputFiles.
  await page.evaluate(() => { for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close(); });
  await page.locator('#stage').scrollIntoViewIfNeeded();
  const box = await page.locator('#stage').boundingBox();
  await page.evaluate(() => {
    window.__nativeDropEvents = [];
    for (const type of ['dragenter', 'dragover', 'drop']) document.addEventListener(type, event => {
      if (window.__nativeDropEvents.length < 30) window.__nativeDropEvents.push({ type, trusted: event.isTrusted, types: [...event.dataTransfer.types], files: event.dataTransfer.files.length });
    }, true);
  });
  try {
    await helper('scripts/desktop-drop.ps1', ['-File', resolve('tests/fixtures/minimal-avatar.vrm'), '-X', String(Math.round(box.x + box.width / 2)), '-Y', String(Math.round(box.y + box.height / 2))]);
  } finally { console.log('Installed native drop events', await page.evaluate(() => window.__nativeDropEvents)); }
  await expect(page.locator('#model-name')).toHaveText('minimal-avatar');
  await expect(page.locator('#stage')).toHaveAttribute('data-render-ready', 'true');
  await page.locator('#quick-miao').evaluate(button => button.click());
  await expect(page.locator('#load-miao')).toBeEnabled();
  await expect(page.locator('#cat-editor')).toBeEnabled();
  await page.screenshot({ path: 'test-results/desktop-camera-io.png' });
  console.log('Installed WebView2: every help link, external allowlist, native OLE drag, three system Save As dialogs and cancellation passed.');
}
