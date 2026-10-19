import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { provisionAccount } from './accounts';
import {
  expectAccessible,
  expectNoOverflow,
  personOnOwnSession,
  sharedBox,
  signedIn,
} from './sessions';

const photo = fileURLToPath(
  new URL('../fixtures/photo-with-gps.jpg', import.meta.url),
);

const loaded = (page: Page, count: number) =>
  expect
    .poll(() =>
      page.evaluate(
        () =>
          [
            ...document.querySelectorAll<HTMLImageElement>(
              'ul[aria-label="Photos"] img',
            ),
          ].filter((image) => image.complete && image.naturalWidth > 0).length,
      ),
    )
    .toBe(count);

test('photos travel from the composer to another member, safely', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);
  const boxUrl = await sharedBox(page, grace.page, graceAccount);

  // Two photos, no text: Post stays locked until both are ready.
  await page.getByLabel('Choose photos').setInputFiles([photo, photo]);
  const post = page.getByRole('button', { name: /^(Post|Preparing photos…)$/ });
  await expect(page.getByText('Ready')).toHaveCount(2, { timeout: 30_000 });
  await expect(
    page.getByRole('button', { name: 'Post', exact: true }),
  ).toBeEnabled();
  await expect(post).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Add more \(2\/4\)/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove photo 2' }).click();
  await page.getByRole('button', { name: 'Post', exact: true }).click();

  // Ada sees her photo in the Box.
  const mine = page.getByRole('list', { name: 'Photos' }).first();
  await expect(mine.getByRole('img')).toHaveCount(1);
  await loaded(page, 1);

  // Grace sees it live, loads it from private storage, and gets clean bytes.
  await grace.page.goto(boxUrl);
  await expect(
    grace.page.getByRole('list', { name: 'Photos' }).getByRole('img'),
  ).toHaveCount(1);
  await loaded(grace.page, 1);
  await expectAccessible(grace.page);
  await expectNoOverflow(grace.page);

  // The viewer opens, steps, and closes with the keyboard.
  const tile = grace.page.getByRole('button', { name: /^Open photo 1 of 1/i });
  await tile.focus();
  await tile.press('Enter');
  const viewer = grace.page.getByRole('dialog');
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText('1 of 1')).toBeVisible();
  const full = viewer.getByRole('img');
  await expect(full).toHaveAttribute(
    'src',
    /display\.webp\?.*X-Amz-Signature=/,
  );
  const src = (await full.getAttribute('src')) ?? '';
  const bytes = await (await grace.page.request.get(src)).body();
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.includes('E2E Camera')).toBe(false);
  await expectAccessible(grace.page);
  await grace.page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(tile).toBeFocused();

  // Deleting the post removes the stored files, not just the database rows.
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByRole('list', { name: 'Photos' })).toHaveCount(0);
  await expect
    .poll(async () => (await grace.page.request.get(src)).status(), {
      timeout: 20_000,
    })
    .toBe(404);
  await grace.context.close();
});

test('a stranger can neither post photos nor see them', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const strangerAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const stranger = await personOnOwnSession(browser, strangerAccount);
  await page.goto('/boxes');
  await page.getByLabel('Box name').fill('Private');
  await page.getByRole('button', { name: 'Create Box' }).click();
  await expect(page).toHaveURL(/\/boxes\/[0-9a-f-]{36}$/);
  await page.getByLabel('Choose photos').setInputFiles(photo);
  await expect(page.getByText('Ready')).toHaveCount(1, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Photos' })).toBeVisible();
  const boxUrl = page.url();

  const response = await stranger.page.goto(boxUrl);
  expect(response?.status()).toBe(404);
  await stranger.page.goto('/home');
  await expect(stranger.page.getByRole('list', { name: 'Photos' })).toHaveCount(
    0,
  );
  await stranger.context.close();
});
