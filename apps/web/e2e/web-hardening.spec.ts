import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

if (
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error(
    'This browser suite requires the disposable Firebase emulators.',
  );

const password = 'LocalFixturePassw0rd!';
const authEmulator = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const photo = fileURLToPath(
  new URL('fixtures/photo-with-gps.jpg', import.meta.url),
);
const sessionCookie = 'paldora_session';
const foreignOrigin = 'https://outside.invalid';
const unknownAsset = '00000000-0000-4000-8000-000000000001';

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/boxes$/);
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Revoke every refresh token of the account, like a password change does. */
async function revokeSessions(email: string) {
  const signInResponse = await fetch(
    `${authEmulator}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  expect(signInResponse.status).toBe(200);
  const { localId } = (await signInResponse.json()) as { localId: string };
  // Session cookies carry whole-second auth times; revoke strictly after them.
  await sleep(1_200);
  const revoked = await fetch(
    `${authEmulator}/identitytoolkit.googleapis.com/v1/projects/demo-paldora/accounts:update`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer owner',
      },
      body: JSON.stringify({
        localId,
        validSince: String(Math.floor(Date.now() / 1000)),
      }),
    },
  );
  expect(revoked.status).toBe(200);
  await sleep(1_200);
}

test('a revoked session cookie is refused by every private route handler', async ({
  page,
  playwright,
}, testInfo) => {
  test.setTimeout(60_000);
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  const email = `phase123-room-${suffix}@example.invalid`;
  await signIn(page, email);
  const cookie = (await page.context().cookies()).find(
    (item) => item.name === sessionCookie,
  );
  expect(cookie?.value).toBeTruthy();
  const origin = new URL(page.url()).origin;
  const stale = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { cookie: `${sessionCookie}=${cookie!.value}` },
  });
  try {
    // Control: the same cookie is still accepted before revocation.
    const control = await stale.get(`/media/${unknownAsset}/display`);
    expect(control.status()).toBe(404);
    expect((await stale.get('/settings/account/download')).status()).toBe(404);

    await revokeSessions(email);

    const events = await stale.get('/events');
    const media = await stale.get(`/media/${unknownAsset}/display`);
    const download = await stale.get('/settings/account/download');
    expect(events.status()).toBe(401);
    expect(media.status()).toBe(401);
    expect(download.status()).toBe(404);
    for (const response of [events, media, download]) {
      const cacheControl = response.headers()['cache-control'] ?? '';
      expect(cacheControl).toContain('private');
      expect(cacheControl).toContain('no-store');
    }
    expect((await events.body()).byteLength).toBe(0);
    expect((await media.body()).byteLength).toBe(0);
    expect(events.headers()['content-type'] ?? '').not.toContain(
      'text/event-stream',
    );
    expect(media.headers()['content-type'] ?? '').not.toContain('image/');
    const downloadText = await download.text();
    expect(downloadText).not.toContain('paldora-json-v1');
    expect(download.headers()['content-disposition'] ?? '').toBe('');
  } finally {
    await stale.dispose();
  }
});

test('media uploads reject foreign, missing and null origins and leave the asset pending', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  await signIn(page, `phase123-photo-${suffix}@example.invalid`);
  let uploadUrl = '';
  let contentType = 'image/jpeg';
  let body: Buffer | null = null;
  await page.route('**/media/upload/*', async (route) => {
    const request = route.request();
    uploadUrl = request.url();
    contentType = request.headers()['content-type'] ?? contentType;
    body = request.postDataBuffer();
    await route.abort();
  });
  await page.goto('/settings/account');
  await page.getByLabel('Choose a profile photo').setInputFiles(photo);
  await expect.poll(() => uploadUrl, { timeout: 30_000 }).not.toBe('');
  await page.unroute('**/media/upload/*');
  expect(new URL(uploadUrl).pathname).toMatch(
    /^\/media\/upload\/[0-9a-f-]{36}$/,
  );
  const payload = body ?? (await readFile(photo));

  const attempts: Array<Record<string, string>> = [
    { origin: foreignOrigin },
    {},
    { origin: 'null' },
  ];
  for (const extra of attempts) {
    const response = await page.request.put(uploadUrl, {
      headers: { 'content-type': contentType, ...extra },
      data: payload,
    });
    expect(response.status(), JSON.stringify(extra)).toBe(403);
    expect(response.headers()['cache-control'] ?? '').toContain('no-store');
  }

  // The asset never left the pending state: a same-origin upload still succeeds once.
  const accepted = await page.request.put(uploadUrl, {
    headers: {
      'content-type': contentType,
      origin: new URL(uploadUrl).origin,
    },
    data: payload,
  });
  expect(accepted.status()).toBe(204);
});

test('a Server Action with a foreign or null Origin cannot create a comment', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  await signIn(page, `phase6-reporter-${suffix}@example.invalid`);
  await page.getByLabel('Box name').fill(`Origin Circle ${suffix}`);
  await page.getByRole('button', { name: 'Create Box' }).click();
  await expect(page).toHaveURL(/\/boxes\/[0-9a-f-]{36}$/);
  await page.getByLabel('Share with this Box').fill('Origin hardening memory');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  const post = page.getByRole('article', { name: 'Post by Local Reporter' });
  const postUrl = await post.getByRole('link').first().getAttribute('href');
  expect(postUrl).toMatch(/^\/posts\/[0-9a-f-]{36}$/);
  await page.goto(postUrl!);

  for (const [index, spoofed] of [foreignOrigin, 'null'].entries()) {
    const content = `Spoofed origin comment ${index}`;
    let intercepted = false;
    await page.route('**/posts/*', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      intercepted = true;
      const response = await route.fetch({
        headers: { ...route.request().headers(), origin: spoofed },
      });
      await route.fulfill({ response });
    });
    await page.getByLabel('Add a comment').fill(content);
    const actionResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/posts/') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Comment', exact: true }).click();
    await actionResponse;
    expect(intercepted).toBe(true);
    await page.unroute('**/posts/*');
    await page.goto(postUrl!);
    await expect(page.getByText(content)).toHaveCount(0);
  }
});
