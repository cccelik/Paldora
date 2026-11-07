import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  expectAccessibleFromTop,
  expectNoOverflow,
  expectSound,
} from './support/a11y';

if (
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error(
    'This browser suite requires the disposable Firebase emulators.',
  );

// Both personalization flags are ON for this suite (firebase-local.config.ts).
// The flags-off matrix lives in room-personalization-off.spec.ts.
const password = 'LocalFixturePassw0rd!';
const suffixOf = (testInfo: { project: { name: string } }) =>
  testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';

async function signIn(page: Page, role: string, suffix: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(`p8-${role}-${suffix}@example.invalid`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/boxes$/);
}

async function visitor(
  browser: Browser,
  baseURL: string,
  role: string,
  suffix: string,
) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signIn(page, role, suffix);
  return { context, page };
}

const css =
  '.room-title { font-weight: 700 }\n.room-text { text-align: center }';

test.describe.configure({ mode: 'serial' });

test('owner saves typography CSS and two widgets, invalid input is rejected, stale saves are refused', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const suffix = suffixOf(testInfo);
  const baseURL = testInfo.project.use.baseURL!;
  await signIn(page, 'owner', suffix);
  const customize = `/rooms/p8owner${suffix}/customize`;
  await page.goto(customize);
  const section = page.getByRole('region', { name: 'Personalization' });
  await expect(section.getByLabel('Room CSS')).toBeVisible();
  await expect(page.getByTestId('css-disabled')).toHaveCount(0);

  const save = section.getByRole('button', { name: 'Save personalization' });
  const rejected = page.getByText(
    'Not saved. Use only the supported CSS and HTML shown above.',
  );

  // Invalid CSS and HTML are rejected with the editor message and store nothing.
  const invalidCss = [
    '.room-title { background: url(https://example.invalid/x.png) }',
    '@import url(https://example.invalid/x.css);',
    'body { font-weight: 700 }',
    '.room-title { font-weight: 700 !important }',
  ];
  for (const bad of invalidCss) {
    await section.getByLabel('Room CSS').fill(bad);
    await save.click();
    await expect(rejected).toBeVisible();
  }
  await section.getByLabel('Room CSS').fill('');
  await section.getByRole('button', { name: 'Add text widget' }).click();
  await section.getByLabel('Widget title').first().fill('Bad');
  const tooMany = `<p>${'<b>x</b>'.repeat(10)}</p>`;
  const nodes129 = `<p>${'<em>a</em>'.repeat(64)}</p>`;
  for (const bad of [
    '<script>alert(1)</script>',
    '<p onclick="x()">hi</p>',
    '<img src="x">',
    tooMany,
    nodes129,
  ]) {
    await section.getByLabel('Widget HTML').first().fill(bad);
    await save.click();
    await expect(rejected).toBeVisible();
  }
  await page.reload();
  await expect(section.getByLabel('Room CSS')).toHaveValue('');
  await expect(section.getByLabel('Widget title')).toHaveCount(0);

  // A stale second tab: save in this one, then the other one is told.
  const other = await page.context().newPage();
  await other.goto(customize);

  await section.getByLabel('Room CSS').fill(css);
  await section.getByRole('button', { name: 'Add text widget' }).click();
  await section.getByRole('button', { name: 'Add text widget' }).click();
  await section.getByLabel('Widget title').nth(0).fill('First note');
  await section.getByLabel('Widget HTML').nth(0).fill('<p>Hello friends</p>');
  await section.getByLabel('Widget title').nth(1).fill('Second note');
  await section.getByLabel('Widget HTML').nth(1).fill('<h3>Hi</h3><p>Bye</p>');
  await save.click();
  await expect(page.getByText('Personalization saved.')).toBeVisible();

  await other
    .getByRole('region', { name: 'Personalization' })
    .getByLabel('Room CSS')
    .fill('.room-card { font-style: italic }');
  await other
    .getByRole('region', { name: 'Personalization' })
    .getByRole('button', { name: 'Save personalization' })
    .click();
  await expect(
    other.getByText('Your Room changed somewhere else'),
  ).toBeVisible();
  await other.close();

  // Keyboard reordering: Move down on widget 1 swaps the two widgets.
  await page.reload();
  await expect(section.getByLabel('Widget title').nth(0)).toHaveValue(
    'First note',
  );
  await section.getByRole('button', { name: 'Move widget 1 down' }).focus();
  await page.keyboard.press('Enter');
  await expect(section.getByLabel('Widget title').nth(0)).toHaveValue(
    'Second note',
  );
  await section.getByRole('button', { name: 'Move widget 2 up' }).focus();
  await page.keyboard.press('Enter');
  await expect(section.getByLabel('Widget title').nth(0)).toHaveValue(
    'First note',
  );
  // Sticky navigation can cover controls after the keyboard moves the page.
  await expectAccessibleFromTop(page);
  await expectNoOverflow(page);

  // The owner sees both widgets on the Room.
  await page.goto(`/rooms/p8owner${suffix}`);
  await expect(page.locator('iframe[sandbox]')).toHaveCount(2);
  await expectSound(page);

  // A friend sees them sandboxed; a blocked user and a stranger see the same not-found.
  const friend = await visitor(browser, baseURL, 'friend', suffix);
  const room = `/rooms/p8owner${suffix}`;
  const response = await friend.page.goto(room);
  expect(response?.status()).toBe(200);
  const csp = ((await response?.headersArray()) ?? []).filter(
    (h) => h.name.toLowerCase() === 'content-security-policy',
  );
  expect(csp).toHaveLength(1);
  expect(csp[0]?.value).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  const frames = friend.page.locator('iframe[sandbox]');
  await expect(frames).toHaveCount(2);
  for (let i = 0; i < 2; i += 1) {
    const frame = frames.nth(i);
    expect(await frame.getAttribute('sandbox')).toBe('');
    const doc = (await frame.getAttribute('srcdoc')) ?? '';
    expect(doc).not.toMatch(/<script|<style|<img|<a |<iframe|<link|\son\w+=/i);
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("script-src 'none'");
    expect(doc).toContain("frame-src 'none'");
  }
  // CSS is applied only inside the scoped canvas; trusted chrome stays unstyled.
  const sheet = await friend.page.request.get(`${room}/personalization.css`);
  expect(sheet.status()).toBe(200);
  expect(sheet.headers()['cache-control']).toContain('no-store');
  const rules = await sheet.text();
  expect(rules).toContain('.room-canvas[data-personalization=');
  for (const line of rules.split('\n').filter(Boolean))
    expect(line.startsWith('.room-canvas[data-personalization="')).toBe(true);
  const chrome = await friend.page.evaluate(() => {
    const canvas = document.querySelector('.room-canvas');
    const nav = document.querySelector('nav');
    const title = document.querySelector('.pal-custom-title');
    return {
      navInside: Boolean(nav && canvas?.contains(nav)),
      titleWeight: title ? getComputedStyle(title).fontWeight : null,
      navWeight: nav ? getComputedStyle(nav).fontWeight : null,
    };
  });
  expect(chrome.navInside).toBe(false);
  expect(chrome.titleWeight).toBe('700');
  expect(chrome.navWeight).not.toBe('700');
  await expectSound(friend.page);
  await friend.context.close();

  const denial: { status: number; body: string }[] = [];
  for (const role of ['blocked', 'stranger']) {
    const who = await visitor(browser, baseURL, role, suffix);
    for (const path of [room, `${room}/personalization.css`]) {
      const result = await who.page.request.get(path);
      denial.push({
        status: result.status(),
        body: (await result.text())
          .replace(/<script[\s\S]*?<\/script>/g, '')
          .replace(/nonce="[^"]*"/g, '')
          .replace(/\s+/g, ' '),
      });
    }
    await who.context.close();
  }
  expect(denial.map((d) => d.status)).toEqual([404, 404, 404, 404]);
  expect(denial[2]!.status).toBe(denial[0]!.status);
  expect(denial[1]!.body).toBe(denial[3]!.body);
});
