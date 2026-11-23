import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5207',
    viewport: { width: 1440, height: 900 },
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5207 --strictPort',
    url: 'http://127.0.0.1:5207',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
