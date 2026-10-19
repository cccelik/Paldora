import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { identityOnly, provisionAccount, signIn } from './accounts';

const photo = fileURLToPath(
  new URL('../fixtures/photo-with-gps.jpg', import.meta.url),
);
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('wrong passwords and unknown emails get the same answer', async ({
  page,
}) => {
  const account = provisionAccount({ complete: true });
  await signIn(page, { email: account.email, password: 'not the password' });
  await expect(
    page.getByText('That email and password don’t match an account.'),
  ).toBeVisible();
  await signIn(page, {
    email: 'nobody@example.test',
    password: 'whatever pass',
  });
  await expect(
    page.getByText('That email and password don’t match an account.'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('an identity that was never provisioned is turned away and signed out', async ({
  page,
  context,
}) => {
  await signIn(page, await identityOnly());
  await expect(
    page.getByText('This account isn’t set up for Paldora.'),
  ).toBeVisible();
  const sessionCookies = (await context.cookies()).filter((cookie) =>
    cookie.name.startsWith('sb-'),
  );
  expect(sessionCookies).toEqual([]);
});

test('a new person completes onboarding and their photo is stored without metadata', async ({
  page,
}) => {
  const errors = watchConsole(page);
  const account = provisionAccount();
  await signIn(page, account);

  await expect(page).toHaveURL(/\/onboarding\/username$/);
  await expectAccessible(page);
  await expectNoOverflow(page);
  await page.getByLabel('Username').fill('Settings');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByText('That username is taken. Try another.'),
  ).toBeVisible();
  await page.getByLabel('Username').fill(account.username);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/onboarding\/profile$/);
  await expectAccessible(page);
  await page.getByLabel('Display name').fill('Ada Tester');
  await page.getByLabel('Bio').fill('Keeping the good stuff.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/onboarding\/avatar$/);
  await expectAccessible(page);
  await page.getByLabel('Choose a profile photo').setInputFiles(photo);
  await expect(page.getByText('Photo saved.')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Finish setup' }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Welcome, Ada Tester.' }),
  ).toBeVisible();
  // The signed derivative loads from private storage under the CSP.
  const avatar = page.locator('main img').first();
  await expect(avatar).toHaveAttribute(
    'src',
    /display\.webp\?.*X-Amz-Signature=/,
  );
  await expect
    .poll(() =>
      avatar.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(512);
  const bytes = await (
    await page.request.get((await avatar.getAttribute('src')) ?? '')
  ).body();
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.includes('E2E Camera')).toBe(false);
  expect(bytes.includes('Exif')).toBe(false);
  await expectAccessible(page);
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test('onboarding pages cannot be revisited once finished', async ({ page }) => {
  const account = provisionAccount({ complete: true });
  await signIn(page, account);
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/onboarding/username');
  await expect(page).toHaveURL(/\/home$/);
});

test('settings save the profile and an appearance that follows the account', async ({
  page,
  browser,
}) => {
  const account = provisionAccount({ complete: true });
  await signIn(page, account);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);
  await expectAccessible(page);
  await expectNoOverflow(page);
  await expect(page.getByLabel('Email')).toHaveValue(account.email);

  await page.getByLabel('Bio').fill('Updated from settings.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();

  await page.getByRole('link', { name: 'Appearance' }).click();
  await page.getByLabel(/Dark/).check();
  await page.getByRole('button', { name: 'Save appearance' }).click();
  await expect(page.getByText('Appearance saved.')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await expectAccessible(page);

  // A fresh device picks the saved appearance up at sign-in.
  const other = await browser.newPage();
  await signIn(other, account);
  await expect(other).toHaveURL(/\/home$/);
  await expect(other.locator('html')).toHaveAttribute(
    'data-appearance',
    'dark',
  );
  await expect(other.getByText('Updated from settings.')).toBeVisible();
  await other.close();
});

test('signing out ends access to signed-in pages', async ({ page }) => {
  const account = provisionAccount({ complete: true });
  await signIn(page, account);
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/home');
  await expect(page).toHaveURL(/\/sign-in$/);
});
