import { test, expect, type Page } from '@playwright/test';

// These must match the credentials the `seed_e2e_user` management command
// creates (the Playwright config runs it before starting the backend). Override
// both together via E2E_EMAIL / E2E_PASSWORD to change them.
const E2E_EMAIL = process.env.E2E_EMAIL || 'e2e@organicmind.local';
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'e2e-test-password-123';

// Sign in through the real UI. The app boots to the welcome screen, so this
// navigates to the sign-in form, submits the seeded credentials, and waits for
// the authenticated workspace (the sidebar) to render.
async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.getByPlaceholder('email.email@mail.com').fill(E2E_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForSelector('aside.sidebar', { timeout: 15000 });
}

test.describe('authentication', () => {
  test('shows the welcome screen when signed out', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();
    await expect(page.locator('aside.sidebar')).toHaveCount(0);
  });

  test('rejects invalid credentials and stays on the sign-in form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Get Started' }).click();
    await page.getByPlaceholder('email.email@mail.com').fill(E2E_EMAIL);
    await page.getByPlaceholder('Enter your password').fill('not-the-right-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByText('Invalid email or password.')).toBeVisible();
    await expect(page.locator('aside.sidebar')).toHaveCount(0);
  });

  test('signs in with valid credentials and reaches the workspace', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('aside.sidebar')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  });
});

test.describe('workspace (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('sidebar exposes the main navigation', async ({ page }) => {
    const sidebar = page.locator('aside.sidebar');
    for (const label of ['Upcoming', 'Today', 'Calendar', 'Sticky Wall', 'Notifications', 'Settings']) {
      await expect(sidebar.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('adds a task and shows it in the Today view', async ({ page }) => {
    const title = `E2E task ${Date.now()}`;
    const addTaskInput = page.getByPlaceholder('Add New Task').first();
    await addTaskInput.fill(title);
    await addTaskInput.press('Enter');

    await expect(page.locator('.task-row .task-title', { hasText: title }).first()).toBeVisible();
  });

  test('navigates to the Settings view', async ({ page }) => {
    await page.locator('aside.sidebar').getByText('Settings', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });
});
