import { expect, test, type Page } from '@playwright/test';
import { expectSound } from './support/a11y';

if (
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error(
    'This browser suite requires the disposable Firebase emulators.',
  );

// Run by firebase-local-personalization-off.config.ts: both flags are unset
// (off). The seed stored CSS and one widget for `p8offowner` while enabled.
const password = 'LocalFixturePassw0rd!';

async function signIn(page: Page, role: string, suffix: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(`p8-${role}-${suffix}@example.invalid`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/boxes$/);
}

test('with both switches off the editor shows both surfaces disabled and no Room renders personalization', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  const baseURL = testInfo.project.use.baseURL!;
  await signIn(page, 'offowner', suffix);
  await page.goto(`/rooms/p8offowner${suffix}/customize`);
  const section = page.getByRole('region', { name: 'Personalization' });
  await expect(page.getByTestId('css-disabled')).toBeVisible();
  await expect(page.getByTestId('widgets-disabled')).toBeVisible();
  await expect(section.getByLabel('Room CSS')).toHaveCount(0);
  await expect(
    section.getByRole('button', { name: 'Save personalization' }),
  ).toHaveCount(0);
  await expectSound(page);

  // The owner's own Room renders nothing, though the source is stored.
  await page.goto(`/rooms/p8offowner${suffix}`);
  await expect(page.locator('iframe[sandbox]')).toHaveCount(0);
  await expect(page.locator('link[href*="personalization.css"]')).toHaveCount(
    0,
  );
  const own = await page.request.get(
    `/rooms/p8offowner${suffix}/personalization.css`,
  );
  expect(own.status()).toBe(200);
  expect(await own.text()).toBe('');
  expect(own.headers()['cache-control']).toContain('no-store');

  // A friend sees the plain token Room.
  const context = await browser.newContext({ baseURL });
  const friend = await context.newPage();
  await signIn(friend, 'offfriend', suffix);
  await friend.goto(`/rooms/p8offowner${suffix}`);
  await expect(
    friend.getByRole('heading', { name: 'Stored Owner' }),
  ).toBeVisible();
  await expect(friend.locator('iframe[sandbox]')).toHaveCount(0);
  await expect(friend.getByText('Stored note')).toHaveCount(0);
  const theirs = await friend.request.get(
    `/rooms/p8offowner${suffix}/personalization.css`,
  );
  expect(await theirs.text()).toBe('');
  await expectSound(friend);
  await context.close();
});
