import { test, expect } from '@playwright/test';
import { createServer } from 'vite';

test('development CSS is applied without weakening production style policy', async ({ page, request }) => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 4175, strictPort: true } });
  try {
    await server.listen();
    const violations = [];
    await page.exposeFunction('recordPolicyViolation', (value) => violations.push(value));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) => window.recordPolicyViolation(event.violatedDirective)));
    await page.goto('http://127.0.0.1:4175');
    await expect(page.locator('.app-shell')).toHaveCSS('display', 'flex');
    expect(violations.filter((value) => value.startsWith('style-src'))).toEqual([]);
    const production = await (await request.get('/')).text();
    expect(production).toContain("style-src 'self';");
    expect(production).not.toContain("style-src 'self' 'unsafe-inline'");
  } finally { await server.close(); }
});
