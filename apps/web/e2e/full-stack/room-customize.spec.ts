import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { fullStackEnvironment } from '../../../../playwright.fullstack.config';
import { provisionAccount, type Account } from './accounts';
import {
  apiAs,
  befriend,
  canvas,
  roomPath,
  shareBox,
  watchCsp,
} from './room-helpers';
import {
  expectAccessible,
  expectNoOverflow,
  personOnOwnSession,
  signedIn,
  tabTo,
} from './sessions';

/**
 * Rooms (Phase 7, slice 7): the owner's customizer. Each section saves on
 * its own with the version it last saw; what it saves shows on the Room
 * that visitors load. Relationships are set up through the API.
 */

const photoPath = fileURLToPath(
  new URL('../fixtures/photo-with-gps.jpg', import.meta.url),
);

/**
 * axe from the top of the page: after a save the page is scrolled, and the
 * sticky app header then really does cover the controls under it.
 */
async function expectAccessibleFromTop(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectAccessible(page);
}

const customizePath = (account: Account) => `${roomPath(account)}/customize`;

async function openCustomize(page: Page, account: Account) {
  const response = await page.goto(customizePath(account));
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Customize your Room' }),
  ).toBeVisible();
}

const sectionIds = {
  Appearance: 'customize-appearance',
  'Who can visit': 'customize-audience',
  About: 'customize-about',
  Banner: 'customize-banner',
  Widgets: 'customize-widgets',
  'Top Friends': 'customize-top-friends',
} as const;

/** A customizer section by its heading (the preview has look-alikes). */
const section = (page: Page, name: keyof typeof sectionIds) =>
  page.locator(`section[aria-labelledby="${sectionIds[name]}-title"]`);

test('appearance changes show in the preview and then on the Room', async ({
  page,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const csp = watchCsp(page);
  await signedIn(page, adaAccount);
  await page.goto(roomPath(adaAccount));
  await page
    .getByRole('complementary', { name: 'Your Room' })
    .getByRole('link', { name: 'Customize' })
    .click();
  await expect(page).toHaveURL(new RegExp(`${customizePath(adaAccount)}$`));
  await expectAccessibleFromTop(page);
  await expectNoOverflow(page);

  const appearance = section(page, 'Appearance');
  // The theme swatches are small canvases too; the preview is the real one.
  const preview = page.locator(
    'section[aria-labelledby="customize-preview-title"] .room-canvas',
  );
  await expect(preview).toHaveCount(1);
  await expect(preview).toHaveAttribute('data-room-theme', 'cream_paper');

  await appearance.getByRole('radio', { name: /Neon Night/ }).check();
  await appearance.getByLabel('Accent').selectOption('emerald');
  await appearance.getByLabel('Heading font').selectOption('mono');
  await appearance.getByRole('radio', { name: /Single column/ }).check();
  // The preview follows the draft before anything is saved.
  await expect(preview).toHaveAttribute('data-room-theme', 'neon_night');
  await expect(preview).toHaveAttribute('data-room-scheme', 'dark');
  await expect(preview).toHaveAttribute('data-room-accent', 'emerald');
  await expect(preview).toHaveAttribute('data-room-layout', 'single');
  // The app around it keeps its own appearance.
  const appAppearance = await page
    .locator('html')
    .getAttribute('data-appearance');
  await appearance.getByRole('button', { name: 'Save appearance' }).click();
  await expect(appearance.getByText('Appearance saved.')).toBeVisible();
  await expectAccessibleFromTop(page);

  await page.goto(roomPath(adaAccount));
  const room = canvas(page);
  await expect(room).toHaveAttribute('data-room-theme', 'neon_night');
  await expect(room).toHaveAttribute('data-room-accent', 'emerald');
  await expect(room).toHaveAttribute('data-room-font', 'mono');
  await expect(room).toHaveAttribute('data-room-layout', 'single');
  expect(await page.locator('html').getAttribute('data-appearance')).toBe(
    appAppearance,
  );

  // "Follow the theme" clears the override again.
  await openCustomize(page, adaAccount);
  await section(page, 'Appearance').getByLabel('Accent').selectOption('');
  await section(page, 'Appearance')
    .getByRole('button', { name: 'Save appearance' })
    .click();
  await expect(page.getByText('Appearance saved.')).toBeVisible();
  await page.goto(roomPath(adaAccount));
  await expect(canvas(page)).toHaveAttribute('data-room-accent', 'pink');
  expect(csp).toEqual([]);
});

test('widgets reorder with the keyboard alone, and the order persists', async ({
  page,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  await openCustomize(page, adaAccount);
  const widgets = section(page, 'Widgets');

  const up = widgets.getByRole('button', {
    name: 'Move Photos up, position 4 of 7',
  });
  await tabTo(page, up, 200);
  await page.keyboard.press('Enter');
  // Focus stays with Photos, now one place higher, and the move is announced.
  await expect(
    widgets.getByRole('button', { name: 'Move Photos up, position 3 of 7' }),
  ).toBeFocused();
  await expect(widgets.getByRole('status').first()).toHaveText(
    'Photos moved to position 3 of 7.',
  );
  await page.keyboard.press('Enter');
  await expect(
    widgets.getByRole('button', { name: 'Move Photos up, position 2 of 7' }),
  ).toBeFocused();
  // Moving down at the very end is disabled; Memories is last.
  await expect(
    widgets.getByRole('button', {
      name: 'Move Memories down, position 7 of 7',
    }),
  ).toBeDisabled();
  const hideMusic = widgets.getByRole('checkbox', { name: 'Show Music' });
  await tabTo(page, hideMusic, 40);
  await page.keyboard.press('Space');
  await expect(hideMusic).not.toBeChecked();
  const save = widgets.getByRole('button', { name: 'Save widgets' });
  await tabTo(page, save, 60);
  await page.keyboard.press('Enter');
  await expect(widgets.getByText('Widgets saved.')).toBeVisible();

  await page.reload();
  await expect(
    section(page, 'Widgets').getByRole('button', {
      name: 'Move Photos up, position 2 of 7',
    }),
  ).toBeVisible();
  await expect(
    section(page, 'Widgets').getByRole('checkbox', { name: 'Show Music' }),
  ).not.toBeChecked();

  await page.goto(roomPath(adaAccount));
  const room = canvas(page);
  await expect(
    room.locator('section[aria-labelledby="room-widget-photos"]'),
  ).toHaveAttribute('data-position', '1');
  await expect(
    room.locator('section[aria-labelledby="room-widget-music"]'),
  ).toHaveCount(0);
});

test('Top Friends: add, reorder, remove, and automatic removal on unfriend and block', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  const hopperAccount = provisionAccount({ complete: true });
  const linusAccount = provisionAccount({ complete: true });
  const [ada, grace, hopper, linus] = await Promise.all([
    apiAs(adaAccount),
    apiAs(graceAccount),
    apiAs(hopperAccount),
    apiAs(linusAccount),
  ]);
  await befriend(ada, grace);
  await befriend(ada, hopper);
  await befriend(ada, linus);

  await signedIn(page, adaAccount);
  await openCustomize(page, adaAccount);
  const topFriends = section(page, 'Top Friends');
  const picker = topFriends.getByLabel('Add a friend');
  for (const friend of [grace, hopper, linus]) {
    await picker.selectOption(friend.id);
    await topFriends.getByRole('button', { name: 'Add', exact: true }).click();
  }
  const order = topFriends.getByRole('list', { name: 'Top Friends order' });
  await expect(order.getByRole('listitem')).toHaveCount(3);
  // Linus to the top, by keyboard, then Hopper off the list.
  const linusUp = topFriends.getByRole('button', {
    name: /^Move Tester .* up, position 3 of 3$/,
  });
  await linusUp.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(
    topFriends.getByRole('button', {
      name: /^Move Tester .* down, position 1 of 3$/,
    }),
  ).toBeFocused();
  await order
    .getByRole('listitem')
    .nth(2)
    .getByRole('button', { name: /^Remove/ })
    .click();
  await expect(order.getByRole('listitem')).toHaveCount(2);
  await topFriends
    .getByRole('radio', { name: /Everyone who can visit/ })
    .check();
  await topFriends.getByRole('radio', { name: 'Top 4' }).check();
  await topFriends.getByRole('button', { name: 'Save Top Friends' }).click();
  await expect(topFriends.getByText('Top Friends saved.')).toBeVisible();
  await expectAccessibleFromTop(page);

  const linksOnRoom = async () => {
    await page.goto(roomPath(adaAccount));
    return canvas(page)
      .locator('section[aria-labelledby="room-widget-top_friends"] a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  };
  // Removing Hopper (third after Linus moved up) left Linus, then Grace.
  expect(await linksOnRoom()).toEqual([
    roomPath(linusAccount),
    roomPath(graceAccount),
  ]);

  // A visitor sees them, because the audience is "Everyone who can visit".
  const visitor = await personOnOwnSession(browser, graceAccount);
  await visitor.page.goto(roomPath(adaAccount));
  await expect(
    canvas(visitor.page).getByRole('link', { name: /^Tester/ }),
  ).toHaveCount(2);
  await visitor.context.close();

  // Unfriending removes someone at once; so does a block.
  await ada.call('DELETE', `/friends/${grace.id}`);
  expect(await linksOnRoom()).toEqual([roomPath(linusAccount)]);
  await linus.call('POST', '/blocks', { username: adaAccount.username });
  expect(await linksOnRoom()).toEqual([]);
  await openCustomize(page, adaAccount);
  await expect(
    section(page, 'Top Friends').getByText('No Top Friends chosen yet.'),
  ).toBeVisible();
});

test('a save from a stale tab asks for a reload and overwrites nothing', async ({
  page,
  context,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  await openCustomize(page, adaAccount);
  const second = await context.newPage();
  await openCustomize(second, adaAccount);

  await section(page, 'Who can visit')
    .getByRole('radio', { name: /Friends and Box members/ })
    .check();
  await section(page, 'Who can visit')
    .getByRole('button', { name: 'Save audience' })
    .click();
  await expect(page.getByText('Audience saved.')).toBeVisible();

  const appearance = section(second, 'Appearance');
  await appearance.getByRole('radio', { name: /Obsidian Gold/ }).check();
  await appearance.getByRole('button', { name: 'Save appearance' }).click();
  const notice = appearance.getByRole('alert');
  await expect(notice).toContainText('Your Room changed somewhere else');
  // Every other section is locked until the reload.
  await expect(
    section(second, 'Who can visit').getByRole('button', {
      name: 'Save audience',
    }),
  ).toBeDisabled();
  await expect(
    section(second, 'Who can visit').getByText(
      'Reload the page to save changes here.',
    ),
  ).toBeVisible();
  await expectAccessibleFromTop(second);

  await notice.getByRole('button', { name: 'Reload' }).click();
  await expect(
    section(second, 'Who can visit').getByRole('radio', {
      name: /Friends and Box members/,
    }),
  ).toBeChecked();
  await expect(
    section(second, 'Appearance').getByRole('radio', { name: /Cream Paper/ }),
  ).toBeChecked();
  // The stale save changed nothing.
  await page.goto(roomPath(adaAccount));
  await expect(canvas(page)).toHaveAttribute('data-room-theme', 'cream_paper');
  await second.close();
});

test('a banner uploads, is processed, shows from a signed URL, and can be removed', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const adaAccount = provisionAccount({ complete: true });
  const csp = watchCsp(page);
  await signedIn(page, adaAccount);
  await openCustomize(page, adaAccount);
  const banner = section(page, 'Banner');
  await expect(banner.getByText('No banner yet.')).toBeVisible();
  await banner.getByLabel('Choose a banner photo').setInputFiles(photoPath);
  await expect(banner.getByText('Banner saved.')).toBeVisible({
    timeout: 45_000,
  });
  const current = banner.getByRole('img', { name: 'Your current banner' });
  const src = (await current.getAttribute('src')) ?? '';
  expect(src.startsWith(fullStackEnvironment.NEXT_PUBLIC_MEDIA_ORIGIN)).toBe(
    true,
  );
  expect(src).toContain('X-Amz-Signature=');

  await page.goto(roomPath(adaAccount));
  const shown = canvas(page).locator('img[alt=""]').first();
  await expect
    .poll(() => shown.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(1600);

  await openCustomize(page, adaAccount);
  await section(page, 'Banner')
    .getByRole('button', { name: 'Remove banner' })
    .click();
  await expect(
    section(page, 'Banner').getByText('Banner removed.'),
  ).toBeVisible();
  await expect(
    section(page, 'Banner').getByText('No banner yet.'),
  ).toBeVisible();
  await page.goto(roomPath(adaAccount));
  await expect(canvas(page).locator('img[alt=""]')).toHaveCount(0);
  expect(csp).toEqual([]);
});

test('the music link takes only public https links', async ({ page }) => {
  const adaAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  await openCustomize(page, adaAccount);
  const about = section(page, 'About');
  const link = about.getByLabel('Link');
  const save = about.getByRole('button', { name: 'Save about' });
  for (const refused of [
    'http://music.example.com/track/1',
    'javascript:alert(1)',
  ]) {
    await link.fill(refused);
    await expect(about.getByText(/Use a public https:\/\/ link/)).toBeVisible();
    await expect(link).toHaveAttribute('aria-invalid', 'true');
    await expect(save).toBeDisabled();
  }
  await link.fill('https://music.example.com/track/7');
  await expect(
    about.getByText('Shows as music.example.com · Opens another site'),
  ).toBeVisible();
  await about.getByLabel('Title').fill('Seven');
  await about.getByLabel('Currently').fill('Reading in the sun');
  await save.click();
  await expect(about.getByText('About saved.')).toBeVisible();

  await page.goto(roomPath(adaAccount));
  const music = canvas(page).getByRole('link', { name: /Seven/ });
  await expect(music).toHaveAttribute(
    'href',
    'https://music.example.com/track/7',
  );
  await expect(canvas(page).getByText('Reading in the sun')).toBeVisible();
});

test('only the owner can open the customizer', async ({ page, browser }) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  const [ada, grace] = await Promise.all([
    apiAs(adaAccount),
    apiAs(graceAccount),
  ]);
  await befriend(ada, grace);
  await signedIn(page, graceAccount);
  // A friend who can visit the Room still cannot customize it.
  expect((await page.goto(roomPath(adaAccount)))?.status()).toBe(200);
  const answers = [];
  for (const path of [
    customizePath(adaAccount),
    '/rooms/nobody_has_this_name',
    '/rooms/nobody_has_this_name/customize',
  ]) {
    const response = await page.goto(path);
    answers.push({
      status: response?.status(),
      main: await page.locator('main').last().innerText(),
    });
  }
  expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404]);
  expect(new Set(answers.map((answer) => answer.main)).size).toBe(1);
  // The owner's own page opens, even with a differently cased name.
  const owner = await personOnOwnSession(browser, adaAccount);
  await openCustomize(owner.page, {
    ...adaAccount,
    username: adaAccount.username.toUpperCase(),
  });
  await owner.context.close();
});

test('an audience change applies to a friend and a Box member at once', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  const memberAccount = provisionAccount({ complete: true });
  const [ada, grace, member] = await Promise.all([
    apiAs(adaAccount),
    apiAs(graceAccount),
    apiAs(memberAccount),
  ]);
  await befriend(ada, grace);
  await shareBox(ada, 'Weekend crew', [member]);

  await signedIn(page, adaAccount);
  const friend = await personOnOwnSession(browser, graceAccount);
  const boxmate = await personOnOwnSession(browser, memberAccount);
  const statuses = async () => [
    (await friend.page.goto(roomPath(adaAccount)))?.status(),
    (await boxmate.page.goto(roomPath(adaAccount)))?.status(),
  ];
  const choose = async (name: RegExp) => {
    await openCustomize(page, adaAccount);
    const audience = section(page, 'Who can visit');
    await audience.getByRole('radio', { name }).check();
    await audience.getByRole('button', { name: 'Save audience' }).click();
    await expect(audience.getByText('Audience saved.')).toBeVisible();
  };

  expect(await statuses()).toEqual([200, 404]);
  await choose(/Friends and Box members/);
  expect(await statuses()).toEqual([200, 200]);
  await choose(/Only me/);
  expect(await statuses()).toEqual([404, 404]);
  await choose(/^Friends\s*Your accepted friends/);
  expect(await statuses()).toEqual([200, 404]);
  await friend.context.close();
  await boxmate.context.close();
});
