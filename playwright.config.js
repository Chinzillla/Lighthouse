const { defineConfig, devices } = require('@playwright/test');

const port = Number(process.env.PORT || 3100);
const baseURL = `http://127.0.0.1:${port}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';

module.exports = defineConfig({
  fullyParallel: true,
  reporter: 'list',
  testDir: './e2e',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run start -- -p ${port}`,
    reuseExistingServer,
    timeout: 120000,
    url: baseURL,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
