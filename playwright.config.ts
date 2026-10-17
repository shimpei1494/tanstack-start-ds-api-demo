import { defineConfig, devices } from '@playwright/test';

const httpMode = process.env.DS_MODE === 'http';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:3101',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    ...(httpMode
      ? [
          {
            command: 'uv run uvicorn probe_app:app --app-dir tests --host 127.0.0.1 --port 8101',
            cwd: 'services/ds-api',
            env: { PYTHONPATH: '.' },
            url: 'http://127.0.0.1:8101/health',
            reuseExistingServer: false,
          },
        ]
      : []),
    {
      command: 'npm run start',
      url: 'http://127.0.0.1:3101/chat',
      reuseExistingServer: false,
      env: {
        PORT: '3101',
        HOST: '127.0.0.1',
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          'postgresql://demo:demo@localhost:5434/work_assistant_test',
        DS_MODE: process.env.DS_MODE ?? 'mock',
        DS_API_URL: httpMode ? 'http://127.0.0.1:8101' : 'http://127.0.0.1:8001',
      },
    },
  ],
});
