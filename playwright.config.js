const { defineConfig, devices } = require('@playwright/test');

const port = Number(process.env.PORT || 3000);
const baseURL = `http://127.0.0.1:${port}`;

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
    reuseExistingServer: !process.env.CI,
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
