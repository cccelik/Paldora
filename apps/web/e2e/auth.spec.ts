import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(
    results.violations.map((violation) => `${violation.id}: ${violation.help}`),
  ).toEqual([]);
}

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the landing page links to sign-in', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('sign-in is labelled, accessible, and fits the viewport', async ({
  page,
}) => {
  const response = await page.goto('/sign-in');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Welcome back' }),
  ).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute(
    'autocomplete',
    'email',
  );
  await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expectAccessible(page);
  await expectNoOverflow(page);
});

test('sign-in buttons meet the touch-target size', async ({ page }) => {
  await page.goto('/sign-in');
  const box = await page.getByRole('button', { name: 'Sign in' }).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test('password recovery pages are accessible', async ({ page }) => {
  for (const path of [
    '/forgot-password',
    '/auth/link-expired',
    '/reset-password',
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expectAccessible(page);
    await expectNoOverflow(page);
  }
});

test('a reset page without a session offers a new link instead of a form', async ({
  page,
}) => {
  await page.goto('/reset-password');
  await expect(
    page.getByText('This reset link is invalid or has expired.'),
  ).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
});

test('signed-out visitors are sent from protected pages to sign-in', async ({
  page,
}) => {
  for (const path of [
    '/home',
    '/settings/account',
    '/settings/appearance',
    '/onboarding/username',
    '/life-updates',
    '/life-updates/new',
    '/memories',
    '/memories/2026',
    '/memories/2026/3',
  ]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/sign-in$/);
  }
});

test('auth callbacks without a valid code never echo details into the URL', async ({
  page,
}) => {
  await page.goto('/auth/callback?code=forged&next=https://evil.example');
  await expect(page).toHaveURL(/\/auth\/link-expired$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'That link has expired',
  );
});

test('the saved appearance cookie renders the theme on the server', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'pal-appearance', value: 'dark', url: 'http://127.0.0.1:3100' },
  ]);
  await page.goto('/sign-in');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(17, 16, 14)',
  );
  await expectAccessible(page);
});

test('an unknown appearance cookie is ignored', async ({ page, context }) => {
  await context.addCookies([
    {
      name: 'pal-appearance',
      value: '"><script>',
      url: 'http://127.0.0.1:3100',
    },
  ]);
  await page.goto('/sign-in');
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-appearance',
    /.*/,
  );
});
