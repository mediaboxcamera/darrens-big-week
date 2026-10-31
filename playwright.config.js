// Playwright config: serves /dist with the tiny static server and runs the
// device-emulated suites. `npm test` builds first.
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8080', trace: 'off' },
  outputDir: 'tests/output',
  webServer: { command: 'node tools/serve.js dist 8080', url: 'http://localhost:8080/index.html', reuseExistingServer: true, timeout: 10000 },
  projects: [
    { name: 'iphone-portrait', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'iphone-landscape', use: { ...devices['iPhone 13 landscape'], browserName: 'chromium' } },
    { name: 'android', use: { ...devices['Pixel 5'], browserName: 'chromium' } },
  ],
});
