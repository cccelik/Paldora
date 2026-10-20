import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { provisionAccount } from './accounts';
import {
  expectAccessible,
  expectNoOverflow,
  personOnOwnSession,
  shareLifeUpdate,
  sharedBox,
  signedIn,
  tabTo,
} from './sessions';

const photo = fileURLToPath(
  new URL('../fixtures/photo-with-gps.jpg', import.meta.url),
);

const lifeUpdateOn = (page: Page) =>
  page.getByRole('article', { name: /^Life Update by/ });
const boxIdOf = (url: string) => url.split('/').at(-1) ?? '';

async function comment(page: Page, text: string) {
  const field = page.getByLabel('Add a comment');
  await field.fill(text);
  await field.press('ControlOrMeta+Enter');
  await expect(
    page
      .getByRole('article', { name: /^Comment by/ })
      .filter({ hasText: text }),
  ).toBeVisible();
}

test('a Life Update reaches two Boxes once, with a conversation per Box', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);
  const crewUrl = await sharedBox(page, grace.page, graceAccount);
  const clubUrl = await sharedBox(page, grace.page, graceAccount, 'Book club');

  // Ada writes it with the keyboard only, from Home.
  await page.goto('/home');
  await page.getByRole('link', { name: 'New Life Update' }).click();
  await expect(page).toHaveURL(/\/life-updates\/new$/);
  const share = page.getByRole('button', { name: 'Share Life Update' });
  await expect(share).toBeDisabled();
  await expect(
    page.getByText('Write at least one section or add a photo.'),
  ).toBeVisible();
  const lately = page.getByLabel('Life lately');
  await tabTo(page, lately);
  await page.keyboard.type('Moved to Lisbon');
  await expect(page.getByText('15 / 2,000')).toBeVisible();
  await expect(page.getByText('Total 15 / 10,000')).toBeVisible();
  await expect(
    page.getByText('Choose at least one Box, or Only me.'),
  ).toBeVisible();
  await page.getByLabel('Choose photos').setInputFiles([photo]);
  await expect(page.getByText('Ready')).toHaveCount(1, { timeout: 30_000 });
  for (const name of ['Book club', 'Weekend crew']) {
    const box = page.getByRole('checkbox', { name });
    await tabTo(page, box);
    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
  }
  await expect(page.getByText('2 of 20 selected')).toBeVisible();
  await expect(
    page.getByText('Where this goes can’t be changed after you share it.'),
  ).toBeVisible();
  await expect(
    page.getByText('Sharing to Book club and Weekend crew.', { exact: false }),
  ).toBeVisible();
  await expect(share).toBeEnabled();
  await expectAccessible(page);
  await expectNoOverflow(page);
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page).toHaveURL(/\/life-updates\/[0-9a-f-]{36}$/);
  const permalink = page.url();

  // Grace sees it once on Home, with alphabetical Box tabs and one photo.
  await grace.page.goto('/home');
  const card = lifeUpdateOn(grace.page);
  await expect(card).toHaveCount(1);
  await expect(card.getByText('Moved to Lisbon')).toBeVisible();
  await expect(
    card.getByRole('list', { name: 'Photos' }).getByRole('img'),
  ).toHaveCount(1);
  const tabs = card.getByRole('tab');
  await expect(tabs).toHaveText(['Book club', 'Weekend crew']);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expectAccessible(grace.page);
  await expectNoOverflow(grace.page);

  // Tabs work from the keyboard: arrows move and select, Home and End jump.
  await tabTo(grace.page, tabs.first());
  await grace.page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await grace.page.keyboard.press('ArrowRight');
  await expect(tabs.first()).toBeFocused();
  await grace.page.keyboard.press('End');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await grace.page.keyboard.press('Home');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

  // A comment in Book club stays in Book club.
  await card
    .getByRole('tabpanel')
    .getByRole('link', { name: 'Comment', exact: true })
    .click();
  await expect(grace.page).toHaveURL(
    new RegExp(`box=${boxIdOf(clubUrl)}#comments$`),
  );
  await comment(grace.page, 'See you there');
  await lifeUpdateOn(grace.page)
    .getByRole('tab', { name: 'Weekend crew' })
    .click();
  await expect(grace.page).toHaveURL(new RegExp(`box=${boxIdOf(crewUrl)}`));
  await expect(grace.page.getByText('No comments yet.')).toBeVisible();
  await expect(grace.page.getByText('See you there')).toHaveCount(0);
  await lifeUpdateOn(grace.page)
    .getByRole('tab', { name: 'Book club' })
    .click();
  await expect(grace.page.getByText('See you there')).toBeVisible();
  await expectAccessible(grace.page);
  await expectNoOverflow(grace.page);

  // Ada's notification opens the Life Update on Book club, comment pinned.
  await page.goto('/notifications');
  const notified = page
    .getByRole('list', { name: 'Notifications' })
    .getByRole('button', {
      name: /commented on your Life Update in Book club/,
    });
  await expect(async () => {
    await page.reload();
    await expect(notified).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await notified.click();
  await expect(page).toHaveURL(
    new RegExp(
      `/life-updates/[0-9a-f-]{36}\\?box=${boxIdOf(clubUrl)}&comment=[0-9a-f-]{36}#comment-`,
    ),
  );
  await expect(
    page
      .getByRole('group', { name: 'Linked comment' })
      .getByText('See you there'),
  ).toBeVisible();
  await expect(
    lifeUpdateOn(page).getByRole('tab', { name: 'Book club' }),
  ).toHaveAttribute('aria-selected', 'true');

  // Each Box feed shows it once, with only that Box's conversation.
  for (const url of [crewUrl, clubUrl]) {
    await grace.page.goto(url);
    const inBox = lifeUpdateOn(grace.page);
    await expect(inBox).toHaveCount(1);
    await expect(inBox.getByRole('tab')).toHaveCount(0);
    await expect(
      inBox.getByRole('link', {
        name: url === clubUrl ? '1 comment' : 'Comment',
        exact: true,
      }),
    ).toBeVisible();
  }
  await expect(
    grace.page.getByRole('link', { name: 'Edit', exact: true }),
  ).toHaveCount(0);

  // Ada edits the sections; the audience is shown, never offered.
  await page.goto(permalink);
  await lifeUpdateOn(page).getByRole('link', { name: 'Edit' }).click();
  await expect(page).toHaveURL(/\/edit/);
  const audience = page.getByRole('list', { name: 'Shared to' });
  await expect(audience.getByRole('listitem')).toHaveText([
    'Book club',
    'Weekend crew',
  ]);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Remove photo 1' }),
  ).toBeVisible();
  await expectAccessible(page);
  await expectNoOverflow(page);
  await page.getByLabel('Life lately').fill('Settled in Lisbon');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/life-updates\/[0-9a-f-]{36}(\?|$)/);
  const edited = lifeUpdateOn(page);
  await expect(edited.getByText('Settled in Lisbon')).toBeVisible();
  await expect(edited.getByText('edited', { exact: true })).toBeVisible();
  await grace.page.goto('/home');
  await expect(
    lifeUpdateOn(grace.page).getByText('Settled in Lisbon'),
  ).toBeVisible();
  await expect(
    lifeUpdateOn(grace.page)
      .getByRole('list', { name: 'Photos' })
      .getByRole('img'),
  ).toHaveCount(1);

  // Deleting asks first, then removes it from every Box.
  await page.goto(permalink);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(
    page.getByText(/removes it from every Box and deletes all comments/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page).toHaveURL(/\/life-updates$/);
  for (const url of ['/home', crewUrl, clubUrl]) {
    await grace.page.goto(url);
    await expect(lifeUpdateOn(grace.page)).toHaveCount(0);
  }
  const gone = await grace.page.goto(permalink);
  expect(gone?.status()).toBe(404);
  await grace.context.close();
});

test('an Only Me Life Update stays private and has no conversation', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);
  await sharedBox(page, grace.page, graceAccount);

  await page.goto('/life-updates/new');
  await page.getByRole('radio', { name: 'Only me' }).check();
  await expect(
    page.getByRole('checkbox', { name: 'Weekend crew' }),
  ).toBeDisabled();
  await expect(
    page.getByText('Only you will see this. Nobody can comment or react.'),
  ).toBeVisible();
  const url = await shareLifeUpdate(page, 'Just for me ✦', 'only_me');
  const card = lifeUpdateOn(page);
  await expect(card.getByText('Only me', { exact: true })).toBeVisible();
  await expect(
    card.getByText('Only you can see this. It has no comments or reactions.'),
  ).toBeVisible();
  await expect(card.getByRole('button', { name: /^React with/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole('heading', { name: /comment/ })).toHaveCount(0);
  await expectAccessible(page);
  await expectNoOverflow(page);

  await page.goto('/home');
  await expect(page.getByText('Just for me ✦')).toHaveCount(0);
  await page.getByRole('link', { name: 'Life Updates', exact: true }).click();
  await expect(page).toHaveURL(/\/life-updates$/);
  await expect(lifeUpdateOn(page).getByText('Just for me ✦')).toBeVisible();
  await expectAccessible(page);
  await expectNoOverflow(page);

  const denied = await grace.page.goto(url);
  expect(denied?.status()).toBe(404);
  await grace.page.goto('/home');
  await expect(grace.page.getByText('Just for me ✦')).toHaveCount(0);
  await grace.context.close();
});

test('a blocked person’s Life Update is a neutral placeholder', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);
  const boxUrl = await sharedBox(page, grace.page, graceAccount);
  const url = await shareLifeUpdate(page, 'Ada’s big news', {
    boxes: ['Weekend crew'],
  });
  await grace.page.goto(boxUrl);
  await expect(grace.page.getByText('Ada’s big news')).toBeVisible();

  await grace.page.goto('/friends');
  const blocked = grace.page.getByRole('region', { name: 'Blocked people' });
  await blocked
    .getByLabel('Block someone by username')
    .fill(adaAccount.username);
  await blocked.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(blocked.getByText(`@${adaAccount.username}`)).toBeVisible();

  for (const path of [boxUrl, '/home']) {
    await grace.page.goto(path);
    await expect(grace.page.getByText('A post here is hidden.')).toHaveCount(1);
    await expect(grace.page.getByText('Ada’s big news')).toHaveCount(0);
    await expect(lifeUpdateOn(grace.page)).toHaveCount(0);
  }
  await expectAccessible(grace.page);
  const hidden = await grace.page.goto(url);
  expect(hidden?.status()).toBe(404);

  // Ada still sees her own, and is told nothing.
  await page.goto(boxUrl);
  await expect(lifeUpdateOn(page).getByText('Ada’s big news')).toBeVisible();
  await expect(page.getByText('A post here is hidden.')).toHaveCount(0);
  await grace.context.close();
});
