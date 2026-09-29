import { test, expect } from '@playwright/test';

test('production page policy permits the exact local binary IPC endpoint', async ({ page }) => {
  const received = [];
  await page.route('http://ipc.localhost/**', route => {
    const request = route.request();
    if (request.method() === 'POST') received.push({ type: request.headers()['content-type'], body: [...request.postDataBuffer()] });
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, contentType: 'application/json', body: 'true' });
  });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const response = await fetch('http://ipc.localhost/native_camera_frame', {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Uint8Array([0,128,255]),
    });
    return response.json();
  });
  expect(result).toBe(true);
  expect(received).toEqual([{ type: 'application/octet-stream', body: [0,128,255] }]);
});
