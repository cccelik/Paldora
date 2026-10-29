import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { expectSound } from './support/a11y';

if (
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error(
    'This browser suite requires the disposable Firebase emulators.',
  );

const password = 'LocalFixturePassw0rd!';
const photo = fileURLToPath(
  new URL('fixtures/photo-with-gps.jpg', import.meta.url),
);

test('private account archive and seven-day deletion cancellation', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  await signIn(page, `phase7-${suffix}@example.invalid`);
  await page.goto('/settings/account');
  await expect(
    page.getByRole('heading', { name: 'Export your data' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Request an archive' }).click();
  await expect(
    page.getByRole('link', { name: 'Download your archive' }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download your archive' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('paldora-data.json');
  const path = await download.path();
  expect(path).toBeTruthy();
  const archive = JSON.parse(await readFile(path!, 'utf8')) as {
    format: string;
    profile: { profile: { displayName: string } };
  };
  expect(archive.format).toBe('paldora-json-v1');
  expect(archive.profile.profile.displayName).toBe('Phase Seven Member');
  await page.getByLabel('Confirm your password').fill('wrong-password');
  await page.getByRole('button', { name: 'Request account deletion' }).click();
  await expect(
    page.getByText('That password did not match your account.'),
  ).toBeVisible();
  await page.getByLabel('Confirm your password').fill(password);
  await page.getByRole('button', { name: 'Request account deletion' }).click();
  await expect(
    page.getByRole('button', { name: 'Cancel deletion' }),
  ).toBeVisible();
  await page.getByLabel('Confirm your password').fill(password);
  await page.getByRole('button', { name: 'Cancel deletion' }).click();
  await expect(
    page.getByRole('button', { name: 'Request account deletion' }),
  ).toBeVisible();
});

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/boxes$/);
}

test('admitted sign-in, onboarding, Box creation and session removal', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  const email = `phase123-${suffix}@example.invalid`;
  const username = `phase123${suffix}`;

  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByText('That email and password don’t match an account.'),
  ).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/onboarding\/username$/);
  const cookie = (await page.context().cookies()).find(
    (item) => item.name === 'paldora_session',
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');

  await page.getByLabel('Username').fill(username);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/onboarding\/profile$/);
  await page.getByLabel('Display name').fill('Local Member');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/onboarding\/avatar$/);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/\/boxes$/);

  await page.getByLabel('Box name').fill('Local Circle');
  await page.getByRole('button', { name: 'Create Box' }).click();
  await expect(page).toHaveURL(/\/boxes\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole('heading', { name: 'Local Circle' }),
  ).toBeVisible();
  await expect(page.getByText('1 member')).toBeVisible();
  await page.getByLabel('Share with this Box').fill('A private local memory');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  const post = page.getByRole('article', { name: 'Post by Local Member' });
  await expect(post).toContainText('A private local memory');
  const boxUrl = page.url();
  await page.goto('/home');
  await expect(
    page.getByRole('article', { name: 'Post by Local Member' }),
  ).toContainText('A private local memory');
  await page.goto(boxUrl);
  await post.getByRole('button', { name: 'React with 👍' }).click();
  await expect(
    post.getByRole('button', { name: 'React with 👍' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(post).toContainText('A private local memory');
  await expect(
    post.getByRole('button', { name: 'React with 👍' }),
  ).toHaveAttribute('aria-pressed', 'true');
  const reactedPostUrl = await post
    .getByRole('link')
    .first()
    .getAttribute('href');
  await page.goto(`${reactedPostUrl}/reactions`);
  await expect(page.getByRole('list', { name: 'Reactions' })).toContainText(
    'Local Member',
  );
  await page.goto(boxUrl);
  await post.getByRole('button', { name: 'React with 👍' }).click();
  await expect(
    post.getByRole('button', { name: 'React with 👍' }),
  ).toHaveAttribute('aria-pressed', 'false');
  const postUrl = await post.getByRole('link').first().getAttribute('href');
  expect(postUrl).toMatch(/^\/posts\/[0-9a-f-]{36}$/);
  await page.goto(postUrl!);
  await expect(
    page.getByRole('article', { name: 'Post by Local Member' }),
  ).toContainText('A private local memory');
  await page.getByLabel('Add a comment').fill('A private comment');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Comments' })).toContainText(
    'A private comment',
  );
  const commentRow = page
    .getByRole('list', { name: 'Comments' })
    .getByRole('listitem')
    .filter({ hasText: 'A private comment' })
    .first();
  await commentRow
    .getByRole('button', { name: 'React to this comment' })
    .click();
  await page
    .getByRole('dialog', { name: 'Choose a reaction' })
    .getByRole('button', { name: 'React with 👍' })
    .click();
  await expect(commentRow.locator('button[aria-pressed="true"]')).toHaveCount(
    1,
  );
  await page.reload();
  await expect(page.getByRole('list', { name: 'Comments' })).toContainText(
    'A private comment',
  );
  await page.getByRole('button', { name: 'Edit comment' }).click();
  await page.getByLabel('Edit comment').fill('An edited private comment');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await expect(page.getByRole('list', { name: 'Comments' })).toContainText(
    'An edited private comment',
  );
  await page.getByLabel('Write a reply').fill('A private reply');
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Comments' })).toContainText(
    'A private reply',
  );
  await page.reload();
  await expect(page.getByRole('list', { name: 'Comments' })).toContainText(
    'A private reply',
  );
  const replyRow = page
    .locator('li[id^="comment-"]')
    .filter({ hasText: 'A private reply' })
    .first();
  await replyRow.getByLabel('Write a reply').fill('Reply to a reply');
  await replyRow.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Comments' })).toContainText(
    'Reply to a reply',
  );
  for (const content of ['Third reply', 'Fourth reply']) {
    await page.reload();
    await page
      .getByRole('list', { name: 'Thread root' })
      .getByLabel('Write a reply')
      .fill(content);
    await expect(
      page
        .getByRole('list', { name: 'Thread root' })
        .getByRole('button', { name: 'Reply', exact: true }),
    ).toBeEnabled();
    await page
      .getByRole('list', { name: 'Thread root' })
      .getByRole('button', { name: 'Reply', exact: true })
      .click();
    await expect(
      page
        .getByRole('list', { name: 'Thread root' })
        .getByLabel('Write a reply'),
    ).toHaveValue('');
  }
  await page.reload();
  await page.getByRole('button', { name: 'View 1 more reply' }).click();
  await expect(page.getByRole('list', { name: 'Replies' })).toContainText(
    'Fourth reply',
  );
  const linkedId = (await replyRow.getAttribute('id'))!.replace('comment-', '');
  await page.goto(`${postUrl}?comment=${linkedId}#comment-${linkedId}`);
  await expect(
    page.getByRole('group', { name: 'Linked comment' }),
  ).toContainText('A private reply');
  await page.getByRole('button', { name: 'Delete comment' }).first().click();
  await page.getByRole('button', { name: 'Yes, delete comment' }).click();
  await expect(page.getByText('An edited private comment')).toHaveCount(0);
  await page.goBack();
  await post.getByRole('button', { name: 'Edit' }).click();
  await post.getByLabel('Edit your post').fill('An edited private memory');
  await post.getByRole('button', { name: 'Save' }).click();
  await expect(post).toContainText('An edited private memory');
  await post.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByText('An edited private memory')).toHaveCount(0);
  await page.goto(postUrl!);
  await expect(
    page.getByRole('heading', { name: 'This page isn’t here.' }),
  ).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'Archive this Box' }).click();
  await expect(
    page.getByText(
      'This Box is archived. It stays readable, but no one new can join until the owner restores it.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Restore this Box' }).click();
  await expect(
    page.getByText(
      'This Box is archived. It stays readable, but no one new can join until the owner restores it.',
    ),
  ).toHaveCount(0);

  await page.goto('/settings/account');
  await page.getByLabel('Display name').fill('Updated Local Member');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue(
    'Updated Local Member',
  );
  await page.goto('/settings/appearance');
  await page.getByRole('radio', { name: /Dark/ }).check();
  await page.getByRole('button', { name: 'Save appearance' }).click();
  await expect(page.getByText('Appearance saved.')).toBeVisible();
  await page.goto('/settings/reactions');
  await page.getByRole('button', { name: 'Save shortcuts' }).click();
  await expect(
    page.getByText('Saved. Your reaction bar uses these now.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(
    (await page.context().cookies()).some(
      (item) => item.name === 'paldora_session',
    ),
  ).toBe(false);
});

test('Only Me and Box Life Updates use Firebase and preserve their audience', async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  await signIn(page, `phase123-${suffix}@example.invalid`);
  await page.goto('/life-updates/new');
  await expect(page.getByRole('button', { name: 'Add photos' })).toBeVisible();
  await page.getByLabel('Life lately').fill('A private chapter');
  await page.getByLabel('Choose photos').setInputFiles(photo);
  await expect(page.getByText('Ready')).toBeVisible({ timeout: 45_000 });
  await page.getByRole('radio', { name: 'Only me' }).check();
  await page.getByRole('button', { name: 'Share Life Update' }).click();
  await expect(page).toHaveURL(/\/life-updates\/[0-9a-f-]{36}$/);
  const onlyMeUrl = page.url();
  await expect(
    page.getByRole('article', { name: /Life Update by/ }),
  ).toContainText('A private chapter');
  const privatePhoto = page
    .getByRole('article', { name: /Life Update by/ })
    .getByRole('list', { name: 'Photos' })
    .getByRole('img');
  await expect(privatePhoto).toBeVisible();
  const privatePhotoUrl = new URL(
    (await privatePhoto.getAttribute('src'))!,
    page.url(),
  ).toString();
  await expect(page.getByText('Only me', { exact: true })).toBeVisible();
  await page.goto('/life-updates');
  await expect(
    page.getByRole('list', { name: 'Your Life Updates' }),
  ).toContainText('A private chapter');
  await page.goto(onlyMeUrl);
  await page.getByRole('link', { name: 'Edit Life Update' }).click();
  await page.getByLabel('Life lately').fill('An edited private chapter');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(onlyMeUrl);
  await expect(
    page.getByRole('article', { name: /Life Update by/ }),
  ).toContainText('An edited private chapter');
  await expect(
    page
      .getByRole('article', { name: /Life Update by/ })
      .getByRole('list', { name: 'Photos' })
      .getByRole('img'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete Life Update' }).click();
  await page.getByRole('button', { name: 'Yes, delete Life Update' }).click();
  await expect(page).toHaveURL(/\/life-updates$/);
  await expect(page.getByText('An edited private chapter')).toHaveCount(0);
  expect((await page.request.get(privatePhotoUrl)).status()).toBe(404);

  await page.goto('/life-updates/new');
  await page.getByLabel('Travel').fill('A Box chapter');
  await page
    .getByRole('list', { name: 'Your Boxes' })
    .getByRole('checkbox', { name: 'Local Circle' })
    .check();
  await page.getByRole('button', { name: 'Share Life Update' }).click();
  await expect(page).toHaveURL(/\/life-updates\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole('article', { name: /Life Update by/ }),
  ).toContainText('A Box chapter');
  await page.goto('/memories');
  await expect(page.getByRole('navigation', { name: 'Years' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Years' })
    .getByRole('link')
    .first()
    .click();
  await expect(page.getByText('A Box chapter')).toBeVisible();
  const month = new Intl.DateTimeFormat('en', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date());
  await page
    .getByRole('navigation', { name: /^Months of / })
    .getByRole('link', { name: month })
    .click();
  await expect(page.getByText('A Box chapter')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectSound(page);
  await page.goto(`/rooms/phase123${suffix}`);
  await expect(page.getByText('A Box chapter')).toBeVisible();
  await page.goto(`/rooms/phase123${suffix}/customize`);
  await expect(
    page.getByRole('heading', { name: 'Customize your Room' }),
  ).toBeVisible();
  await page.goto(`/rooms/phase123${suffix}/memories`);
  await expect(page.getByText('A Box chapter')).toBeVisible();
  await page.goto('/home');
  await expect(
    page.getByRole('article', { name: /Life Update by/ }),
  ).toContainText('A Box chapter');
  await expect(page.getByText('An edited private chapter')).toHaveCount(0);
  await page.goto('/boxes');
  await page.getByRole('link', { name: 'Local Circle' }).click();
  await expect(
    page.getByRole('article', { name: /Life Update by/ }),
  ).toContainText('A Box chapter');
  const delivered = page.getByRole('article', { name: /Life Update by/ });
  await delivered.getByRole('button', { name: 'React with 👍' }).click();
  await expect(
    delivered.getByRole('button', { name: 'React with 👍' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    delivered.getByRole('link', { name: 'Comment' }),
  ).toHaveAttribute('href', /\/life-updates\/[0-9a-f-]{36}\?box=/);
  await page
    .getByRole('article', { name: /Life Update by/ })
    .getByRole('link')
    .first()
    .click();
  await expect(page).toHaveURL(
    /\/life-updates\/[0-9a-f-]{36}\?box=[0-9a-f-]{36}$/,
  );
  await expect(
    page.getByRole('article', { name: /Life Update by/ }),
  ).toContainText('A Box chapter');
  await page.getByLabel('Add a comment').fill('A delivery conversation');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Comments' })).toContainText(
    'A delivery conversation',
  );
  await page.reload();
  await expect(page.getByRole('list', { name: 'Comments' })).toContainText(
    'A delivery conversation',
  );
});

test('friendship, invitation, ownership transfer and Box deletion', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(45_000);
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  const peerEmail = `phase123-peer-${suffix}@example.invalid`;
  const peerUsername = `phase123peer${suffix}`;
  await signIn(page, `phase123-${suffix}@example.invalid`);
  await page.getByRole('link', { name: 'Local Circle' }).click();
  await expect(page).toHaveURL(/\/boxes\/[0-9a-f-]{36}$/);
  const boxUrl = page.url();
  await page.getByLabel('Share with this Box').fill('Members only text');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  const privatePostUrl = await page
    .getByRole('article', { name: 'Post by Updated Local Member' })
    .getByRole('link')
    .first()
    .getAttribute('href');
  expect(privatePostUrl).toMatch(/^\/posts\/[0-9a-f-]{36}$/);
  await page.getByLabel('Their username').fill(peerUsername);
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(
    page.getByRole('list', { name: 'Pending invitations' }),
  ).toContainText('Local Peer');

  const peerContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const peerPage = await peerContext.newPage();
  try {
    await signIn(peerPage, peerEmail);
    await peerPage.goto(boxUrl);
    await expect(
      peerPage.getByRole('heading', { name: 'This page isn’t here.' }),
    ).toBeVisible();
    await peerPage.goto(privatePostUrl!);
    await expect(
      peerPage.getByRole('heading', { name: 'This page isn’t here.' }),
    ).toBeVisible();
    await peerPage.goto('/boxes');
    await expect(
      peerPage.getByRole('list', { name: 'Box invitations' }),
    ).toContainText('Local Circle');
    await peerPage.getByRole('button', { name: 'Join' }).click();
    await expect(
      peerPage.getByRole('link', { name: 'Local Circle' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.goto('/friends');
    await page.getByLabel('Their username').fill(peerUsername);
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(
      page.getByRole('list', { name: 'Friend requests' }),
    ).toContainText('Local Peer');
    await peerPage.goto('/friends');
    await peerPage.getByRole('button', { name: 'Accept' }).click();
    await expect(peerPage.getByRole('list', { name: 'Friends' })).toContainText(
      `phase123${suffix}`,
    );

    await page.goto('/friends');
    await page
      .getByRole('list', { name: 'Friends' })
      .getByRole('button', { name: 'Block' })
      .click();
    await page.getByRole('button', { name: 'Yes, block' }).click();
    await expect(
      page.getByRole('list', { name: 'Blocked people' }),
    ).toContainText('Local Peer');
    await expect(
      page.getByText('No friends yet. Send a request by username above.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Unblock' }).click();
    await expect(page.getByText('You haven’t blocked anyone.')).toBeVisible();

    await page.goto(boxUrl);
    await expect(page.getByText('2 members')).toBeVisible();
    await page.getByRole('button', { name: 'Make owner' }).click();
    await page.getByRole('button', { name: 'Yes, transfer' }).click();
    await expect(page.getByRole('list', { name: 'Members' })).toContainText(
      'Local Peer',
    );
    await expect(page.getByRole('list', { name: 'Members' })).toContainText(
      'Owner',
    );
    await expect(
      page.getByRole('button', { name: 'Leave this Box' }),
    ).toBeVisible();
    await peerPage.goto(boxUrl);
    await expect(
      peerPage.getByRole('heading', { name: 'Local Circle' }),
    ).toBeVisible();
    await peerPage
      .getByLabel('Type “Local Circle” to confirm')
      .fill('Local Circle');
    await peerPage
      .getByRole('checkbox', { name: /I understand this can’t be undone/ })
      .check();
    await peerPage
      .getByRole('button', { name: 'Delete this Box forever' })
      .click();
    await expect(peerPage).toHaveURL(/\/boxes$/);
    await expect(
      peerPage.getByRole('link', { name: 'Local Circle' }),
    ).toHaveCount(0);
    await page.goto(boxUrl);
    await expect(
      page.getByRole('heading', { name: 'This page isn’t here.' }),
    ).toBeVisible();
  } finally {
    await peerContext.close();
  }
});

test('unadmitted and suspended identities cannot get a web session', async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  for (const state of ['unadmitted', 'suspended']) {
    await page.goto('/sign-in');
    await page
      .getByLabel('Email')
      .fill(`phase123-${state}-${suffix}@example.invalid`);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(
      page.getByText('That email and password don’t match an account.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in$/);
    expect(
      (await page.context().cookies()).some(
        (item) => item.name === 'paldora_session',
      ),
    ).toBe(false);
  }
});

test('a cross-origin Server Action cannot create a Box', async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  await signIn(page, `phase123-${suffix}@example.invalid`);
  let intercepted = false;
  await page.route('**/boxes', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    intercepted = true;
    const response = await route.fetch({
      headers: {
        ...route.request().headers(),
        origin: 'https://outside.invalid',
      },
    });
    await route.fulfill({ response });
  });
  await page.getByLabel('Box name').fill('Cross Origin Rejected');
  const actionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/boxes') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create Box' }).click();
  await actionResponse;
  await expect.poll(() => intercepted).toBe(true);
  await page.unroute('**/boxes');
  await page.goto('/boxes');
  await expect(
    page.getByRole('link', { name: 'Cross Origin Rejected' }),
  ).toHaveCount(0);
});

test('password recovery revokes an older browser session', async ({
  page,
  browser,
  request,
}, testInfo) => {
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  const email = `phase123-peer-${suffix}@example.invalid`;
  await page.goto('/forgot-password');
  const staleContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const stalePage = await staleContext.newPage();
  try {
    await signIn(stalePage, email);
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(
      page.getByText('If that account exists, a reset link is on its way.'),
    ).toBeVisible();
    const response = await request.get(
      'http://127.0.0.1:9099/emulator/v1/projects/demo-paldora/oobCodes',
    );
    expect(response.ok()).toBe(true);
    const codes = (await response.json()) as {
      oobCodes?: Array<{ email: string; oobCode: string; requestType: string }>;
    };
    const code = codes.oobCodes?.find(
      (item) => item.email === email && item.requestType === 'PASSWORD_RESET',
    )?.oobCode;
    if (!code) throw new Error('Password reset code was not issued.');
    await page.goto(`/reset-password?oobCode=${encodeURIComponent(code)}`);
    const nextPassword = 'ReplacementPassw0rd!';
    await page
      .getByRole('textbox', { name: 'New password', exact: true })
      .fill(nextPassword);
    await page
      .getByRole('textbox', { name: 'Confirm new password' })
      .fill(nextPassword);
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByText('Password updated.')).toBeVisible();
    await stalePage.goto('/boxes');
    await expect(stalePage).toHaveURL(/\/sign-in$/);
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(nextPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/boxes$/);
  } finally {
    await staleContext.close();
  }
});

test('password change requires current credentials and ends the web session', async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  const email = `phase123-${suffix}@example.invalid`;
  await signIn(page, email);
  await page.goto('/settings/account');
  await page.getByLabel('Current password').fill('wrong-password');
  await page
    .getByLabel('New password', { exact: true })
    .fill('AnotherPassw0rd!');
  await page.getByLabel('Confirm new password').fill('AnotherPassw0rd!');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(
    page.getByText(
      'That password could not be changed. Check your current password and try again.',
    ),
  ).toBeVisible();
  await page.getByLabel('Current password').fill(password);
  await page
    .getByLabel('New password', { exact: true })
    .fill('AnotherPassw0rd!');
  await page.getByLabel('Confirm new password').fill('AnotherPassw0rd!');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByText('That email and password don’t match an account.'),
  ).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('AnotherPassw0rd!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/boxes$/);
});

test('private Firebase post photos process, reauthorize and retire on deletion', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  await signIn(page, `phase123-photo-${suffix}@example.invalid`);
  await page.goto('/boxes');
  await page.getByLabel('Box name').fill(`Photo Circle ${suffix}`);
  await page.getByRole('button', { name: 'Create Box' }).click();
  await expect(page).toHaveURL(/\/boxes\/[0-9a-f-]{36}$/);
  await page.getByLabel('Choose photos').setInputFiles(photo);
  await expect(page.getByText('Ready')).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  const post = page
    .getByRole('article', { name: 'Post by Local Peer' })
    .first();
  const image = post.getByRole('list', { name: 'Photos' }).getByRole('img');
  await expect(image).toBeVisible();
  const path = await image.getAttribute('src');
  expect(path).toMatch(/^\/media\/[0-9a-f-]{36}\/thumbnail$/);
  const boxUrl = page.url();
  await page.goto(`/rooms/phase123photo${suffix}`);
  await expect(
    page.getByRole('region', { name: 'Photos' }).getByRole('img'),
  ).toHaveAttribute('src', new URL(path!, page.url()).toString());
  await page.goto(boxUrl);
  const imageUrl = new URL(path!, page.url()).toString();
  const privateContext = await browser.newContext();
  try {
    expect((await privateContext.request.get(imageUrl)).status()).toBe(401);
    expect((await page.request.get(imageUrl)).status()).toBe(200);
    await post.getByRole('button', { name: 'React with your camera' }).click();
    const camera = page.getByRole('dialog', { name: 'Camera reaction' });
    await expect(
      camera.getByRole('button', { name: 'Take photo' }),
    ).toBeEnabled();
    await camera.getByRole('button', { name: 'Take photo' }).click();
    await camera.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
      camera.getByText('Sent. Your camera reaction is on the post.'),
    ).toBeVisible();
    await camera.getByRole('button', { name: 'Done' }).click();
    const reaction = post
      .getByRole('list', { name: 'Camera reactions' })
      .getByRole('img');
    await expect(reaction).toBeVisible();
    const reactionUrl = new URL(
      (await reaction.getAttribute('src'))!,
      page.url(),
    ).toString();
    expect((await page.request.get(reactionUrl)).status()).toBe(200);
    await post.getByRole('button', { name: 'React with 👍' }).click();
    await expect(reaction).toHaveCount(0);
    expect((await page.request.get(reactionUrl)).status()).toBe(404);
    await post.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Yes, delete' }).click();
    await expect(post).toHaveCount(0);
    expect((await page.request.get(imageUrl)).status()).toBe(404);
  } finally {
    await privateContext.close();
  }
});

test('Firebase avatar and Room banner use private processed media', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  await signIn(page, `phase123-room-${suffix}@example.invalid`);
  await page.goto('/settings/account');
  await page.getByLabel('Choose a profile photo').setInputFiles(photo);
  await expect(page.getByText('Photo saved.')).toBeVisible({ timeout: 45_000 });
  await page.reload();
  const avatar = page
    .locator('section[aria-labelledby="photo-title"] img')
    .first();
  await expect(avatar).toHaveAttribute(
    'src',
    /\/media\/[0-9a-f-]{36}\/display/,
  );
  await page.goto(`/rooms/phase123room${suffix}/customize`);
  await page.getByLabel('Choose a banner photo').setInputFiles(photo);
  await expect(page.getByText('Banner saved.')).toBeVisible({
    timeout: 45_000,
  });
  await page.reload();
  await expect(page.getByAltText('Your current banner')).toHaveAttribute(
    'src',
    /\/media\/[0-9a-f-]{36}\/display/,
  );
});

test('Firebase notifications, report receipts, staff takedown and SSE', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  await signIn(page, `phase6-reporter-${suffix}@example.invalid`);
  await expect(page.locator('[data-realtime="connected"]')).toBeAttached({
    timeout: 15_000,
  });
  await page.route('**/events', (route) => route.abort());
  await page.reload();
  await expect(page.locator('[data-realtime="connecting"]')).toBeAttached();
  await page.unroute('**/events');
  await expect(page.locator('[data-realtime="connected"]')).toBeAttached({
    timeout: 20_000,
  });
  await page.getByLabel('Box name').fill(`Phase Six ${suffix}`);
  await page.getByRole('button', { name: 'Create Box' }).click();
  const boxUrl = page.url();
  await page.getByLabel('Share with this Box').fill('A reportable memory');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  const post = page.getByRole('article', { name: 'Post by Local Reporter' });
  const postUrl = await post.getByRole('link').first().getAttribute('href');
  expect(postUrl).toMatch(/^\/posts\/[0-9a-f-]{36}$/);
  await page.getByLabel('Their username').fill(`phase6actor${suffix}`);
  await page.getByRole('button', { name: 'Send invitation' }).click();

  const actorContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const staffContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const actor = await actorContext.newPage();
    await signIn(actor, `phase6-actor-${suffix}@example.invalid`);
    await actor.getByRole('button', { name: 'Join' }).click();
    await expect(
      actor.getByRole('link', { name: `Phase Six ${suffix}` }),
    ).toBeVisible({ timeout: 15_000 });
    await actor.goto(postUrl!);
    await actor.getByLabel('Add a comment').fill('A reply for the owner');
    await actor.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(
      page.getByRole('link', { name: /Notifications, 1 unread/ }),
    ).toBeVisible({ timeout: 15_000 });
    await page.goto('/notifications');
    await expect(
      page.getByRole('list', { name: 'Notifications' }),
    ).toContainText('Local Actor commented');
    await page
      .getByRole('list', { name: 'Notifications' })
      .getByRole('button')
      .first()
      .click();
    await expect(page).toHaveURL(/\/posts\/[0-9a-f-]{36}/);
    await page.goto(postUrl!);
    await page.getByText('Report this post').click();
    const postReport = page
      .locator('details')
      .filter({ hasText: 'Report this post' });
    await postReport.getByLabel('Reason').selectOption('privacy');
    await postReport.getByRole('button', { name: 'Send report' }).click();
    await expect(
      page.getByText('Report received. Thank you for letting us know.'),
    ).toBeVisible();
    await page.goto('/settings/reports');
    await expect(page.getByText('privacy', { exact: true })).toBeVisible();

    const staff = await staffContext.newPage();
    await signIn(staff, `phase6-staff-${suffix}@example.invalid`);
    await staff.goto('/moderation');
    await expect(
      staff.getByRole('link', { name: 'post report' }),
    ).toBeVisible();
    await staff.getByRole('link', { name: 'post report' }).click();
    await staff.getByRole('combobox', { name: 'Action' }).selectOption('hide');
    await staff
      .getByLabel('Reason for the audit record')
      .fill('Confirmed the reported content should be hidden.');
    await staff.getByRole('button', { name: 'Record action' }).click();
    await expect(staff.getByText('Action recorded.')).toBeVisible();
    await page.goto(postUrl!);
    await expect(
      page.getByRole('heading', { name: 'This page isn’t here.' }),
    ).toBeVisible();
    await page.goto('/settings/content-notices');
    await expect(
      page.getByText('Your post was hidden by moderation.'),
    ).toBeVisible();
    await actor.goto(boxUrl);
    await expect(actor.getByText('A reportable memory')).toHaveCount(0);

    await page.goto(`/rooms/phase6actor${suffix}`);
    await page.getByText('Report this person').click();
    const personReport = page
      .locator('details')
      .filter({ hasText: 'Report this person' });
    await personReport.getByLabel('Reason').selectOption('harassment');
    await personReport.getByRole('button', { name: 'Send report' }).click();
    await expect(
      page.getByText('Report received. Thank you for letting us know.'),
    ).toBeVisible();
    await staff.goto('/moderation');
    await staff.getByRole('link', { name: 'Person report' }).click();
    await staff
      .getByRole('combobox', { name: 'Action' })
      .selectOption('suspend');
    await staff
      .getByLabel('Reason for the audit record')
      .fill('Confirmed harassment report and suspended this account.');
    await staff.getByRole('button', { name: 'Record action' }).click();
    await expect(staff.getByText('Action recorded.')).toBeVisible();
    await actor.goto('/boxes');
    await expect(actor).toHaveURL(/\/(sign-in|account-unavailable)$/);
  } finally {
    await actorContext.close();
    await staffContext.close();
  }
});
