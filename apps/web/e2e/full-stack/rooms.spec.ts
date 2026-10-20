import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { fullStackEnvironment } from '../../../../playwright.fullstack.config';
import { provisionAccount, type Account } from './accounts';
import {
  expectAccessible,
  expectNoOverflow,
  personOnOwnSession,
  signedIn,
  tabTo,
} from './sessions';

/**
 * Rooms (Phase 7, slice 6): viewing a Room and getting there. Set-up that
 * belongs to other features (friends, Boxes, posts, Room settings, the
 * banner upload) goes straight to the API as each person, so the browser
 * time is spent on the Room itself. Customizing through the UI is slice 7.
 */

const PRESETS = [
  'obsidian_gold',
  'cream_paper',
  'lavender_dream',
  'ocean_glow',
  'daisy_day',
  'neon_night',
  'y2k_glitter',
  'dark_academia',
  'frutiger_aero',
  'tumblr_2014',
  'retro_windows',
  'cyberpunk',
  'minimal_editorial',
  'polaroid_scrapbook',
] as const;

const apiUrl = fullStackEnvironment.NEXT_PUBLIC_API_URL;
const authUrl = fullStackEnvironment.SUPABASE_URL;
const photo = readFileSync(
  fileURLToPath(new URL('../fixtures/photo-with-gps.jpg', import.meta.url)),
);

type Json = Record<string, unknown>;

async function tokenFor(account: Account): Promise<string> {
  const response = await fetch(`${authUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  expect(response.ok).toBe(true);
  return ((await response.json()) as { access_token: string }).access_token;
}

/** One person talking to the API directly. */
async function apiAs(account: Account) {
  const token = await tokenFor(account);
  const call = async <T = Json>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    expect(response.ok, `${method} ${path}: ${text}`).toBe(true);
    return (text ? JSON.parse(text) : {}) as T;
  };
  const me = await call<{ user: { id: string } }>('GET', '/me');
  return { call, id: me.user.id, account };
}
type Person = Awaited<ReturnType<typeof apiAs>>;

async function befriend(a: Person, b: Person) {
  const request = await a.call<{ id: string }>('POST', '/friend-requests', {
    username: b.account.username,
  });
  await b.call('POST', `/friend-requests/${request.id}/accept`);
}

async function shareBox(owner: Person, name: string, members: Person[]) {
  const box = await owner.call<{ id: string }>('POST', '/boxes', { name });
  for (const member of members) {
    await owner.call('POST', `/boxes/${box.id}/invitations`, {
      username: member.account.username,
    });
    const invitations = await member.call<{
      items: Array<{ id: string; box: { id: string } }>;
    }>('GET', '/me/box-invitations');
    const invitation = invitations.items.find((item) => item.box.id === box.id);
    await member.call('POST', `/box-invitations/${invitation?.id}/accept`);
  }
  return box.id;
}

async function updateRoom(person: Person, change: Json) {
  const room = await person.call<{ updatedAt: string | null }>(
    'GET',
    '/me/room',
  );
  return person.call('PATCH', '/me/room', {
    ...change,
    expectedUpdatedAt: room.updatedAt,
  });
}

async function setTopFriends(person: Person, friends: Person[]) {
  const room = await person.call<{ updatedAt: string | null }>(
    'GET',
    '/me/room',
  );
  await person.call('PUT', '/me/room/top-friends', {
    userIds: friends.map((friend) => friend.id),
    size: 4,
    visibility: 'visible',
    expectedUpdatedAt: room.updatedAt,
  });
}

/** Reserve → PUT → complete → wait for the worker → attach to the Room. */
async function uploadBanner(person: Person) {
  const reserved = await person.call<{
    mediaAsset: { id: string };
    upload: { url: string; headers: Record<string, string> };
  }>('POST', '/media/uploads', {
    purpose: 'room_banner',
    contentType: 'image/jpeg',
    contentLength: photo.byteLength,
  });
  const put = await fetch(reserved.upload.url, {
    method: 'PUT',
    headers: reserved.upload.headers,
    body: photo,
  });
  expect(put.ok).toBe(true);
  const id = reserved.mediaAsset.id;
  await person.call('POST', `/media/uploads/${id}/complete`);
  await expect
    .poll(
      async () =>
        (await person.call<{ status: string }>('GET', `/media/${id}`)).status,
      { timeout: 30_000 },
    )
    .toBe('ready');
  await updateRoom(person, { bannerMediaId: id });
}

const canvas = (page: Page) => page.locator('.room-canvas');
const roomPath = (account: Account) => `/rooms/${account.username}`;

/** Collects Content-Security-Policy reports from the console. */
function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  return violations;
}

async function expectSound(page: Page) {
  await expectAccessible(page);
  await expectNoOverflow(page);
}

/** Nothing inside the canvas is navigation, a form, or a trusted control. */
async function expectNoTrustedControls(page: Page) {
  await expect(
    canvas(page).locator('nav, form, button, input, select, textarea, iframe'),
  ).toHaveCount(0);
  const hrefs = await canvas(page)
    .locator('a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  for (const href of hrefs) {
    expect(href, String(href)).toMatch(
      /^(\/rooms\/|\/posts\/|\/life-updates\/|https:\/\/)/,
    );
  }
}

test('the owner views their own default Room and gets there from the primary nav', async ({
  page,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const csp = watchCsp(page);
  await signedIn(page, adaAccount);

  const desktop = test.info().project.name === 'desktop';
  const nav = page.getByRole('navigation', {
    name: desktop ? 'Primary' : 'Primary mobile',
    exact: true,
  });
  const myRoom = nav.getByRole('link', { name: 'My Room' });
  await tabTo(page, myRoom);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${roomPath(adaAccount)}$`));
  await expect(myRoom).toHaveAttribute('aria-current', 'page');

  const room = canvas(page);
  await expect(room).toHaveAttribute('data-room-theme', 'cream_paper');
  await expect(room).toHaveAttribute('data-room-layout', 'two_column');
  await expect(
    room.getByRole('heading', { level: 1, name: /^Tester / }),
  ).toBeVisible();
  await expect(room.getByText(`@${adaAccount.username}`)).toBeVisible();
  // Honest owner hints, no sample content.
  await expect(
    room.getByText('Say what you’re up to in Customize.'),
  ).toBeVisible();
  await expect(
    room.getByText('Choose the friends to show here in Customize.'),
  ).toBeVisible();
  await expect(
    room.getByText('Your latest posts in your Boxes show up here.'),
  ).toBeVisible();

  // The trusted strip is outside the canvas.
  const strip = page.getByRole('complementary', { name: 'Your Room' });
  await expect(strip.getByText('Visible to: Friends')).toBeVisible();
  await expect(strip.getByRole('link', { name: 'Customize' })).toBeVisible();
  await expect(room.getByRole('link', { name: 'Customize' })).toHaveCount(0);
  await expectNoTrustedControls(page);
  await expectSound(page);

  if (!desktop) {
    // The fixed bottom nav sits above the Room, never under it.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
    const onTop = await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest('nav')
          ?.getAttribute('aria-label') ?? null,
      {
        x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
        y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
      },
    );
    expect(onTop).toBe('Primary mobile');
    // Settings moved to the avatar in the header.
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings\/account$/);
  }
  expect(csp).toEqual([]);
});

test('a friend sees what the owner shared with them, never Only Me or other Boxes', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  const [ada, grace] = await Promise.all([
    apiAs(adaAccount),
    apiAs(graceAccount),
  ]);
  await befriend(ada, grace);
  const shared = await shareBox(ada, 'Weekend crew', [grace]);
  const elsewhere = await shareBox(ada, 'Ada alone', []);
  await ada.call('POST', `/boxes/${shared}/posts`, {
    content: 'Picnic on Sunday',
  });
  await ada.call('POST', `/boxes/${elsewhere}/posts`, {
    content: 'Only in my other Box',
  });
  await ada.call('POST', '/life-updates', {
    audience: { type: 'boxes', boxIds: [shared] },
    sections: { lifeLately: 'Moved to Lisbon' },
  });
  await ada.call('POST', '/life-updates', {
    audience: { type: 'only_me' },
    sections: { lifeLately: 'A private note to self' },
  });
  await updateRoom(ada, {
    currently: '<script>window.__pwned = true</script> reading',
    location: 'Lisbon',
    music: {
      url: 'https://music.example.com/track/42',
      title: 'Sunday Song',
      artist: 'The Picnics',
    },
  });
  await setTopFriends(ada, [grace]);

  // The owner's own view never shows Only Me either.
  const csp = watchCsp(page);
  await signedIn(page, adaAccount);
  await page.goto(roomPath(adaAccount));
  await expect(canvas(page).getByText('Picnic on Sunday')).toBeVisible();
  await expect(page.getByText('A private note to self')).toHaveCount(0);

  const visitor = await personOnOwnSession(browser, graceAccount);
  const visitorCsp = watchCsp(visitor.page);
  const response = await visitor.page.goto(roomPath(adaAccount));
  expect(response?.status()).toBe(200);
  const room = canvas(visitor.page);
  await expect(room.getByText('Picnic on Sunday')).toBeVisible();
  await expect(room.getByText(/Moved to Lisbon/)).toBeVisible();
  await expect(room.getByText('Only in my other Box')).toHaveCount(0);
  await expect(visitor.page.getByText('A private note to self')).toHaveCount(0);
  await expect(room.getByText('Location: Lisbon')).toBeVisible();

  // Room text is text: the script never runs and no element is created.
  await expect(room.getByText(/<script>window.__pwned/)).toBeVisible();
  expect(
    await visitor.page.evaluate(
      () => (window as unknown as { __pwned?: boolean }).__pwned,
    ),
  ).toBeUndefined();

  // The music card is a plain external link with the hostname.
  const music = room.getByRole('link', { name: /Sunday Song/ });
  await expect(music).toHaveAttribute(
    'href',
    'https://music.example.com/track/42',
  );
  await expect(music).toHaveAttribute(
    'rel',
    'noopener noreferrer nofollow ugc',
  );
  await expect(music).toHaveAttribute('target', '_blank');
  await expect(music).toContainText('music.example.com · Opens another site');

  // Top Friends link to Rooms; previews link out to the real items.
  await expect(
    room.getByRole('link', { name: new RegExp(`^Tester`) }),
  ).toHaveAttribute('href', roomPath(graceAccount));
  await expect(
    room.getByRole('link', { name: 'Picnic on Sunday' }),
  ).toHaveAttribute('href', /^\/posts\/[0-9a-f-]{36}$/);
  await expect(
    room.getByRole('link', { name: /Moved to Lisbon/ }),
  ).toHaveAttribute('href', /^\/life-updates\/[0-9a-f-]{36}\?box=/);

  // Visitors get no owner chrome.
  await expect(
    visitor.page.getByRole('complementary', { name: 'Your Room' }),
  ).toHaveCount(0);
  await expect(
    visitor.page.getByRole('link', { name: 'Customize' }),
  ).toHaveCount(0);
  await expectNoTrustedControls(visitor.page);
  await expectSound(visitor.page);

  // Memories chips lead to the Room's Memories, still re-filtered.
  const year = new Date().getUTCFullYear();
  await room.getByRole('link', { name: `${year} 2 memories` }).click();
  await expect(visitor.page).toHaveURL(
    new RegExp(`${roomPath(adaAccount)}/memories\\?year=${year}$`),
  );
  await expect(visitor.page.getByText('Picnic on Sunday')).toBeVisible();
  await expect(visitor.page.getByText('Only in my other Box')).toHaveCount(0);
  await expect(visitor.page.getByText('A private note to self')).toHaveCount(0);
  await expectSound(visitor.page);
  const malformed = await visitor.page.goto(
    `${roomPath(adaAccount)}/memories?year=99`,
  );
  expect(malformed?.status()).toBe(404);

  // The friend's own row in Friends links to the owner's Room.
  await visitor.page.goto('/friends');
  await visitor.page
    .getByRole('link', { name: /’s Room$/ })
    .first()
    .click();
  await expect(visitor.page).toHaveURL(new RegExp(`${roomPath(adaAccount)}$`));

  expect([...csp, ...visitorCsp]).toEqual([]);
  await visitor.context.close();
});

test('a stranger, a made-up name, a malformed name, and a block all get the same 404', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  const strangerAccount = provisionAccount({ complete: true });
  const [ada, grace] = await Promise.all([
    apiAs(adaAccount),
    apiAs(graceAccount),
  ]);
  await befriend(ada, grace);
  await signedIn(page, strangerAccount);

  // The shared not-found page has its own <main>: compare the innermost.
  const answers = [];
  for (const path of [
    roomPath(adaAccount),
    '/rooms/nobody_has_this_name',
    '/rooms/not.a.username',
    `${roomPath(adaAccount)}/memories`,
  ]) {
    const response = await page.goto(path);
    answers.push({
      path,
      status: response?.status(),
      main: await page.locator('main').last().innerText(),
    });
  }
  expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404]);
  expect(new Set(answers.map((answer) => answer.main)).size).toBe(1);
  await expect(
    page.getByRole('heading', { level: 1, name: 'This page isn’t here.' }),
  ).toBeVisible();
  await expect(page.locator('.room-canvas')).toHaveCount(0);

  // A friend can visit, until a block in either direction.
  const friend = await personOnOwnSession(browser, graceAccount);
  expect((await friend.page.goto(roomPath(adaAccount)))?.status()).toBe(200);
  await grace.call('POST', '/blocks', { username: adaAccount.username });
  const blockedBy = await friend.page.goto(roomPath(adaAccount));
  const blockedMain = await friend.page.locator('main').last().innerText();
  const owner = await personOnOwnSession(browser, adaAccount);
  const blocker = await owner.page.goto(roomPath(graceAccount));
  expect([blockedBy?.status(), blocker?.status()]).toEqual([404, 404]);
  expect(blockedMain).toBe(answers[0]?.main);
  expect(await owner.page.locator('main').last().innerText()).toBe(
    answers[0]?.main,
  );
  await friend.context.close();
  await owner.context.close();
});

test('every Room theme is accessible with a banner, at this width, in both app appearances', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const adaAccount = provisionAccount({ complete: true });
  const ada = await apiAs(adaAccount);
  const box = await shareBox(ada, 'Weekend crew', []);
  await ada.call('POST', `/boxes/${box}/posts`, {
    content: 'Picnic on Sunday',
  });
  await ada.call('POST', '/life-updates', {
    audience: { type: 'boxes', boxIds: [box] },
    sections: { lifeLately: 'Moved to Lisbon' },
  });
  await uploadBanner(ada);
  await updateRoom(ada, {
    currently: 'Reading in the sun',
    location: 'Lisbon',
    sparkles: true,
    music: {
      url: 'https://music.example.com/track/1',
      title: 'Song',
      artist: null,
    },
  });

  const csp = watchCsp(page);
  await signedIn(page, adaAccount);
  await page.goto(roomPath(adaAccount));

  // The banner is the processed derivative, from a signed storage URL.
  const banner = canvas(page).locator('img[alt=""]').first();
  const src = (await banner.getAttribute('src')) ?? '';
  expect(src.startsWith(fullStackEnvironment.NEXT_PUBLIC_MEDIA_ORIGIN)).toBe(
    true,
  );
  expect(src).toContain('X-Amz-Signature=');
  expect((await page.request.get(src)).status()).toBe(200);
  await expect
    .poll(() =>
      banner.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(1600);

  for (const [index, themePreset] of PRESETS.entries()) {
    const appearance = index % 2 === 0 ? 'light' : 'dark';
    await context.addCookies([
      {
        name: 'pal-appearance',
        value: appearance,
        url: fullStackEnvironment.NEXT_PUBLIC_WEB_URL,
      },
    ]);
    await updateRoom(ada, {
      themePreset,
      layout: index % 3 === 0 ? 'single' : 'two_column',
    });
    await page.goto(roomPath(adaAccount));
    await expect(canvas(page)).toHaveAttribute('data-room-theme', themePreset);
    await expect(page.locator('html')).toHaveAttribute(
      'data-appearance',
      appearance,
    );
    await expectSound(page);
  }
  expect(csp).toEqual([]);
});

test('sparkles hold still when reduced motion is asked for', async ({
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const ada = await apiAs(adaAccount);
  await updateRoom(ada, { sparkles: true });
  const { viewport, isMobile, hasTouch, userAgent, baseURL } =
    test.info().project.use;
  const context = await browser.newContext({
    ...(viewport ? { viewport } : {}),
    ...(isMobile !== undefined ? { isMobile } : {}),
    ...(hasTouch !== undefined ? { hasTouch } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(baseURL ? { baseURL } : {}),
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await signedIn(page, adaAccount);
  await page.goto(roomPath(adaAccount));
  await expect(canvas(page)).toHaveAttribute('data-room-sparkles', 'on');
  const running = await canvas(page).evaluate(
    (element) =>
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.playState === 'running').length,
  );
  expect(running).toBe(0);
  await context.close();
});
