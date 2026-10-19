import { expect, test, type Page } from '@playwright/test';
import { provisionAccount } from './accounts';
import {
  expectAccessible,
  expectNoOverflow,
  personOnOwnSession,
  sharedBox,
  signedIn,
} from './sessions';

test('a post is written, seen, edited, and deleted', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);
  const boxUrl = await sharedBox(page, grace.page, graceAccount);

  await expect(
    page.getByText('No posts yet. Be the first to share.'),
  ).toBeVisible();
  const composer = page.getByLabel('Share with this Box');
  const post = page.getByRole('button', { name: 'Post', exact: true });
  await expect(post).toBeDisabled();
  await composer.fill('First light ✦\nsecond line');
  await expect(page.getByText('25 / 5,000')).toBeVisible();
  await composer.press('ControlOrMeta+Enter');
  await expect(page.getByText('First light ✦')).toBeVisible();
  await expect(composer).toHaveValue('');
  await expectAccessible(page);
  await expectNoOverflow(page);

  // Another member sees it in the Box and on Home, without edit controls.
  await grace.page.goto(boxUrl);
  await expect(grace.page.getByText('First light ✦')).toBeVisible();
  await expect(grace.page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await grace.page.goto('/home');
  const onHome = grace.page.getByRole('article', { name: /Post by/ });
  await expect(onHome.getByText('First light ✦')).toBeVisible();
  await expect(onHome.getByText('Weekend crew')).toBeVisible();
  await expectAccessible(grace.page);
  await expectNoOverflow(grace.page);

  // The author edits it.
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Edit your post').fill('Edited light');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(
    page.getByRole('paragraph').filter({ hasText: 'Edited light' }),
  ).toBeVisible();
  await expect(page.getByText('edited', { exact: true })).toBeVisible();

  // Permalink works for members and 404s for anyone else.
  await page
    .getByRole('link', { name: /\d{4}|UTC|AM|PM/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/posts\/[0-9a-f-]{36}$/);
  const permalink = page.url();
  await expect(page.getByText('Edited light')).toBeVisible();

  // Deleting asks first, then removes the post everywhere.
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText('Edited light')).toHaveCount(0);
  const gone = await grace.page.goto(permalink);
  expect(gone?.status()).toBe(404);
  await grace.context.close();
});

test('a blocked person’s post is hidden without saying who blocked whom', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);
  const boxUrl = await sharedBox(page, grace.page, graceAccount);

  await page.getByLabel('Share with this Box').fill('Ada’s private thought');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText('Ada’s private thought')).toBeVisible();
  await grace.page.goto(boxUrl);
  await expect(grace.page.getByText('Ada’s private thought')).toBeVisible();

  // Grace blocks Ada. Both stay in the Box.
  await grace.page.goto('/friends');
  const blocked = grace.page.getByRole('region', { name: 'Blocked people' });
  await blocked
    .getByLabel('Block someone by username')
    .fill(adaAccount.username);
  await blocked.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(blocked.getByText(`@${adaAccount.username}`)).toBeVisible();

  for (const path of [boxUrl, '/home']) {
    await grace.page.goto(path);
    await expect(grace.page.getByText('A post here is hidden.')).toBeVisible();
    await expect(grace.page.getByText('Ada’s private thought')).toHaveCount(0);
    await expect(grace.page.getByText(adaAccount.username)).toHaveCount(
      path === boxUrl ? 1 : 0,
    );
  }
  await expectAccessible(grace.page);

  // Ada sees her own post as normal, and is not told anything.
  await page.goto(boxUrl);
  await expect(page.getByText('Ada’s private thought')).toBeVisible();
  await expect(page.getByText('A post here is hidden.')).toHaveCount(0);
  await grace.context.close();
});

const live = (page: Page) => page.locator('[data-realtime="connected"]');

test('other members see changes without reloading', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);
  const boxUrl = await sharedBox(page, grace.page, graceAccount);

  // Grace watches the Box page and, in a second tab, Home.
  await grace.page.goto(boxUrl);
  await expect(live(grace.page)).toBeAttached();
  const homeTab = await grace.context.newPage();
  await homeTab.goto('/home');
  await expect(live(homeTab)).toBeAttached();

  await page.getByLabel('Share with this Box').fill('Fresh off the press');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(grace.page.getByText('Fresh off the press')).toBeVisible({
    timeout: 10_000,
  });
  await expect(homeTab.getByText('Fresh off the press')).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Edit your post').fill('Fresher still');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(grace.page.getByText('Fresher still')).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(grace.page.getByText('Fresher still')).toHaveCount(0, {
    timeout: 10_000,
  });

  // Removal reaches the open page: the Box simply stops being there.
  await page.reload();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(
    grace.page.getByRole('heading', {
      level: 1,
      name: 'This page isn’t here.',
    }),
  ).toBeVisible({ timeout: 10_000 });
  await grace.context.close();
});
