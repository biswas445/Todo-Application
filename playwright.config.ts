import { defineConfig, devices } from '@playwright/test';

// The E2E suite needs both the Django API and the Vite dev server. Playwright
// starts them via `webServer` (array form) and waits for each `url` to respond
// before running the tests.
//
// The backend runs against the local venv interpreter by default; point
// E2E_PYTHON at a different executable (e.g. in CI) to override. Migrations are
// applied and a known-active e2e user is seeded before the server starts so the
// login flow has real credentials to sign in with.
const pythonBin =
  process.env.E2E_PYTHON ||
  (process.platform === 'win32' ? 'venv\\Scripts\\python' : 'venv/bin/python');

const backendCommand = [
  `${pythonBin} manage.py migrate --noinput`,
  `${pythonBin} manage.py seed_e2e_user`,
  `${pythonBin} manage.py runserver 127.0.0.1:8000`,
].join(' && ');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: backendCommand,
      url: 'http://127.0.0.1:8000/api/health/',
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
