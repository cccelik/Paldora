import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Collects console errors, which include CSP violations and hydration bugs. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(
    results.violations.map((violation) => `${violation.id}: ${violation.help}`),
  ).toEqual([]);
}

test('landing page presents the promise accessibly', async ({ page }) => {
  const errors = watchConsole(page);
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: 'A box for your people.' }),
  ).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await expectAccessible(page);
  expect(errors).toEqual([]);
});

test('dark appearance follows the system preference and stays accessible', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(17, 16, 14)',
  );
  await expectAccessible(page);
});

test('serves exactly one strict, per-request CSP', async ({ page }) => {
  const first = await page.goto('/');
  const policies = (await first!.headersArray()).filter(
    (header) => header.name.toLowerCase() === 'content-security-policy',
  );
  expect(policies).toHaveLength(1);
  const policy = policies[0]!.value;
  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(policy).not.toContain("'unsafe-inline'");
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy).toContain("frame-ancestors 'none'");

  const second = await page.goto('/');
  const nonce = (value: string) => /'nonce-([^']+)'/.exec(value)?.[1];
  expect(
    nonce((await second!.headerValue('content-security-policy')) ?? ''),
  ).not.toBe(nonce(policy));
});

test('sends baseline security headers without a framework fingerprint', async ({
  page,
}) => {
  const response = await page.goto('/');
  const headers = response!.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['x-powered-by']).toBeUndefined();
});

test('has no horizontal overflow at this viewport', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('keyboard users can skip straight to content', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Keyboard navigation is a desktop interaction.');
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to content' });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeInViewport();
});

test('unknown routes return 404 with the shared not-found state', async ({
  page,
}) => {
  const response = await page.goto('/this-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { level: 1, name: 'This page isn’t here.' }),
  ).toBeVisible();
  await expectAccessible(page);
});
