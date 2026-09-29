import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const releasesUrl = 'https://github.com/bocmiao/MIAO-Motion/releases';
const release = tag => ({
  tag_name: tag,
  draft: false,
  assets: [`MIAO.Motion_${tag.replace(/^v|-beta$/g, '')}_x64-setup.exe`, 'MIAO-Motion-portable.zip']
    .flatMap(name => [name, `${name}.sha256`])
    .map(name => ({ name, size: 10, browser_download_url: `${releasesUrl}/download/${tag}/${name}` })),
});

async function checkWith(page, releases) {
  await page.route('https://api.github.com/**', route => route.fulfill({ json: releases }));
  await page.goto('/');
  await page.locator('#onboarding-later').click();
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  await page.locator('#check-update').click();
}

test('update check reports a newer beta and keeps the download link usable', async ({ page }) => {
  await checkWith(page, [release('v9.9.9-beta'), release(`v${version}-beta`)]);
  await expect(page.locator('#update-status')).toHaveText('发现新版本 v9.9.9-beta，请打开下载页更新。');
  const link = page.getByRole('link', { name: '打开下载页' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', './download.html');
});

test('the same-numbered beta is not an update, but the same-numbered stable release is', async ({ page }) => {
  await checkWith(page, [release(`v${version}-beta`)]);
  await expect(page.locator('#update-status')).toHaveText(`当前版本 v${version} 已是最新可用版本。`);
  await page.unroute('https://api.github.com/**');
  await page.route('https://api.github.com/**', route => route.fulfill({ json: [release(`v${version}-beta`), release(`v${version}`)] }));
  await page.locator('#check-update').click();
  await expect(page.locator('#update-status')).toHaveText(`发现新版本 v${version}，请打开下载页更新。`);
  await expect(page.getByRole('link', { name: '打开下载页' })).toBeVisible();
});
