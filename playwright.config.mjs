import { defineConfig } from '@playwright/test';
const port = Number(process.env.MIAO_TEST_PORT ?? 4173);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // SwiftShader and real vision engines compete for CPU even on many-core hosts.
  workers: 2,
  // Rendering and local inference on shared CPU-only runners exceed UI-only budgets.
  expect: { timeout: 15_000 },
  timeout: 90_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    viewport: { width: 1280, height: 720 },
    launchOptions: { ...(process.env.MIAO_BROWSER ? { executablePath: process.env.MIAO_BROWSER } : {}), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build:app && npm run start -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
