import { expect, test, type Page } from '@playwright/test';
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

// Everything is shared during the test, so it lands in the current UTC month.
const now = new Date();
const year = now.getUTCFullYear();
const month = now.getUTCMonth() + 1;
const monthName = new Intl.DateTimeFormat('en', {
  month: 'long',
  timeZone: 'UTC',
}).format(now);

const lifeUpdateOn = (page: Page) =>
  page.getByRole('article', { name: /^Life Update by/ });
const postOn = (page: Page) => page.getByRole('article', { name: /^Post by/ });

async function postInBox(page: Page, boxUrl: string, text: string) {
  await page.goto(boxUrl);
  const composer = page.getByLabel('Share with this Box');
  await composer.fill(text);
  await composer.press('ControlOrMeta+Enter');
  await expect(page.getByText(text)).toBeVisible();
}

async function expectSound(page: Page) {
  await expectAccessible(page);
  await expectNoOverflow(page);
}

test('Memories gather posts and Life Updates once, by year and month, from the keyboard', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);

  // Nothing yet: an honest empty state, no sample content.
  await grace.page.goto('/memories');
  await expect(grace.page.getByText(/^No memories yet\./)).toBeVisible();
  await expectSound(grace.page);

  const crewUrl = await sharedBox(page, grace.page, graceAccount);
  await sharedBox(page, grace.page, graceAccount, 'Book club');
  await postInBox(page, crewUrl, 'Picnic on Sunday');
  const permalink = await shareLifeUpdate(page, 'Moved to Lisbon', {
    boxes: ['Book club', 'Weekend crew'],
  });

  // Grace gets there with the keyboard only: nav, year, then month.
  await grace.page.goto('/home');
  const nav = grace.page.getByRole('navigation', { name: 'Primary' });
  const memories = nav.getByRole('link', { name: 'Memories' });
  await tabTo(grace.page, memories);
  await grace.page.keyboard.press('Enter');
  await expect(grace.page).toHaveURL(/\/memories$/);
  await expect(memories).toHaveAttribute('aria-current', 'page');
  const yearLink = grace.page
    .getByRole('navigation', { name: 'Years' })
    .getByRole('link', { name: `${year} 2 memories` });
  await expectSound(grace.page);
  await tabTo(grace.page, yearLink);
  await grace.page.keyboard.press('Enter');
  await expect(grace.page).toHaveURL(new RegExp(`/memories/${year}$`));
  await expect(
    grace.page.getByRole('heading', { level: 2, name: `${monthName} ${year}` }),
  ).toBeVisible();
  const months = grace.page.getByRole('navigation', {
    name: `Months of ${year}`,
  });
  await expect(months.getByRole('link')).toHaveCount(1);
  await expect(months.getByRole('listitem')).toHaveCount(12);
  await expectSound(grace.page);
  const monthLink = months.getByRole('link', {
    name: `${monthName} 2 memories`,
  });
  await tabTo(grace.page, monthLink);
  await grace.page.keyboard.press('Enter');
  await expect(grace.page).toHaveURL(new RegExp(`/memories/${year}/${month}$`));
  await expect(
    grace.page.getByRole('heading', { level: 1, name: `${monthName} ${year}` }),
  ).toBeVisible();

  // One card for the two-Box Life Update, with alphabetical tabs.
  const card = lifeUpdateOn(grace.page);
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('tab')).toHaveText(['Book club', 'Weekend crew']);
  await expect(postOn(grace.page).getByText('Picnic on Sunday')).toBeVisible();
  await expectSound(grace.page);

  // The type filter narrows the same month.
  const show = grace.page.getByRole('navigation', { name: 'Show' });
  await show.getByRole('link', { name: 'Life Updates' }).click();
  await expect(grace.page).toHaveURL(/type=life_updates$/);
  await expect(lifeUpdateOn(grace.page)).toHaveCount(1);
  await expect(postOn(grace.page)).toHaveCount(0);
  await show.getByRole('link', { name: 'Posts' }).click();
  await expect(grace.page).toHaveURL(/type=posts$/);
  await expect(lifeUpdateOn(grace.page)).toHaveCount(0);
  await expect(postOn(grace.page)).toHaveCount(1);
  await expect(show.getByRole('link', { name: 'Posts' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // A Box's Memories, from the Box page: only that Box, no tabs.
  await grace.page.goto(crewUrl);
  await grace.page
    .getByRole('main')
    .getByRole('link', { name: 'Memories', exact: true })
    .click();
  await expect(grace.page).toHaveURL(/\/boxes\/[0-9a-f-]{36}\/memories$/);
  await expect(
    grace.page.getByRole('heading', {
      level: 1,
      name: `Weekend crew Memories: ${year}`,
    }),
  ).toBeVisible();
  const inBox = lifeUpdateOn(grace.page);
  await expect(inBox).toHaveCount(1);
  await expect(inBox.getByRole('tab')).toHaveCount(0);
  await expect(postOn(grace.page).getByText('Picnic on Sunday')).toBeVisible();
  await expectSound(grace.page);

  // Deleted content leaves every Memories view at once.
  await page.goto(permalink);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page).toHaveURL(/\/life-updates$/);
  await grace.page.reload();
  await expect(lifeUpdateOn(grace.page)).toHaveCount(0);
  await expect(postOn(grace.page)).toHaveCount(1);
  await grace.page.goto(`/memories/${year}/${month}`);
  await expect(lifeUpdateOn(grace.page)).toHaveCount(0);
  await expect(grace.page.getByText('Moved to Lisbon')).toHaveCount(0);
  await grace.page.goto('/memories');
  await expect(
    grace.page
      .getByRole('navigation', { name: 'Years' })
      .getByRole('link', { name: `${year} 1 memory` }),
  ).toBeVisible();
  await grace.context.close();
});

test('only current members see a Box’s Memories; addresses are checked first', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  const linusAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);
  const linus = await personOnOwnSession(browser, linusAccount);
  const boxUrl = await sharedBox(page, grace.page, graceAccount);
  await postInBox(page, boxUrl, 'Members only');
  const memoriesUrl = `${boxUrl}/memories`;

  await grace.page.goto(memoriesUrl);
  await expect(grace.page.getByText('Members only')).toBeVisible();

  // A stranger and a guessed Box get the same not-found page.
  for (const url of [
    memoriesUrl,
    '/boxes/00000000-0000-4000-8000-000000000000/memories',
  ]) {
    const denied = await linus.page.goto(url);
    expect(denied?.status(), url).toBe(404);
  }
  await expectAccessible(linus.page);

  // Malformed periods never reach the API.
  for (const url of [
    '/memories/1969',
    '/memories/abcd',
    `/memories/${year}/13`,
    `/memories/${year}/03`,
    `/memories/${year}?type=photos`,
    `${memoriesUrl}?year=20x6`,
    `${memoriesUrl}?month=3`,
  ]) {
    const response = await page.goto(url);
    expect(response?.status(), url).toBe(404);
  }

  // After removal, Grace's Box Memories and personal Memories drop it.
  await page.goto(boxUrl);
  await page
    .getByRole('listitem')
    .filter({ hasText: `@${graceAccount.username}` })
    .getByRole('button', { name: 'Remove' })
    .click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByText(`@${graceAccount.username}`)).toHaveCount(0);
  const removed = await grace.page.goto(memoriesUrl);
  expect(removed?.status()).toBe(404);
  await grace.page.goto(`/memories/${year}/${month}`);
  await expect(grace.page.getByText('Members only')).toHaveCount(0);
  await expect(
    grace.page.getByText(
      `Nothing from ${monthName} ${year} that you can still see.`,
    ),
  ).toBeVisible();
  await expectSound(grace.page);
  await grace.context.close();
  await linus.context.close();
});

test('Only Me stays with its author and a blocked author is left out', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);
  const boxUrl = await sharedBox(page, grace.page, graceAccount);
  await shareLifeUpdate(page, 'Ada’s big news', { boxes: ['Weekend crew'] });
  await shareLifeUpdate(page, 'Just for me ✦', 'only_me');
  const monthUrl = `/memories/${year}/${month}`;

  // Ada sees both; Only Me never reaches the Box's Memories.
  await page.goto(monthUrl);
  await expect(lifeUpdateOn(page)).toHaveCount(2);
  await expect(page.getByText('Just for me ✦')).toBeVisible();
  await page.goto(`${boxUrl}/memories`);
  await expect(page.getByText('Ada’s big news')).toBeVisible();
  await expect(page.getByText('Just for me ✦')).toHaveCount(0);

  await grace.page.goto(monthUrl);
  await expect(grace.page.getByText('Ada’s big news')).toBeVisible();
  await expect(grace.page.getByText('Just for me ✦')).toHaveCount(0);

  // Grace blocks Ada: Ada's content is omitted, with no placeholder.
  await grace.page.goto('/friends');
  const blocked = grace.page.getByRole('region', { name: 'Blocked people' });
  await blocked
    .getByLabel('Block someone by username')
    .fill(adaAccount.username);
  await blocked.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(blocked.getByText(`@${adaAccount.username}`)).toBeVisible();
  for (const url of [monthUrl, `${boxUrl}/memories`]) {
    await grace.page.goto(url);
    await expect(grace.page.getByText('Ada’s big news')).toHaveCount(0);
    await expect(grace.page.getByText('A post here is hidden.')).toHaveCount(0);
    await expect(lifeUpdateOn(grace.page)).toHaveCount(0);
  }
  await grace.page.goto('/memories');
  await expect(grace.page.getByText(/^No memories yet\./)).toBeVisible();
  await expectSound(grace.page);

  // Ada still has her own, Only Me included, and is told nothing.
  await page.goto(monthUrl);
  await expect(lifeUpdateOn(page)).toHaveCount(2);
  await grace.context.close();
});
