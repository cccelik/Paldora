import { expect, test, type Page } from '@playwright/test';

const accounts = [
  {
    label: 'primary demo',
    email: process.env.DEMO_USER_EMAIL,
    password: process.env.DEMO_USER_PASSWORD,
  },
  {
    label: 'friend demo',
    email: process.env.DEMO_FRIEND_EMAIL,
    password: process.env.DEMO_FRIEND_PASSWORD,
  },
].filter(
  (account): account is { label: string; email: string; password: string } =>
    Boolean(account.email && account.password),
);

if (accounts.length === 0) {
  test('hosted demo credentials are configured', () => {
    test.skip(true, 'No hosted demo credentials are configured.');
  });
}

for (const account of accounts) {
  test(`${account.label} can authenticate and access Phase 3A`, async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(
      page.getByRole('heading', { name: 'Home', exact: true }),
    ).toBeVisible();

    await page.goto('/boxes');
    await expect(page.getByRole('heading', { name: 'Boxes' })).toBeVisible();
    await page.goto('/friends');
    await expect(
      page.getByRole('heading', { name: 'Friends', exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });
}

test('Box and Home feeds receive another member post without a reload', async ({
  browser,
}) => {
  test.skip(
    accounts.length < 2 || !process.env.DEMO_FRIEND_USERNAME,
    'Two provisioned demo accounts and DEMO_FRIEND_USERNAME are required.',
  );
  const [primary, friend] = accounts;
  if (!primary || !friend || !process.env.DEMO_FRIEND_USERNAME) return;
  const primaryContext = await browser.newContext();
  const friendContext = await browser.newContext();
  const primaryPage = await primaryContext.newPage();
  const friendPage = await friendContext.newPage();
  const friendHomePage = await friendContext.newPage();
  const marker = Date.now();
  const boxName = `Realtime test ${marker}`;
  const postText = `Live post ${marker}`;
  const editedText = `${postText} edited`;
  let boxUrl: string | null = null;
  try {
    await signIn(primaryPage, primary);
    await signIn(friendPage, friend);

    await primaryPage.goto('/boxes/new');
    await primaryPage.getByLabel('Box name').fill(boxName);
    await primaryPage
      .getByRole('button', { name: 'Create private Box' })
      .click();
    await expect(primaryPage).toHaveURL(/\/boxes\/[0-9a-f-]+/);
    boxUrl = primaryPage.url();

    await primaryPage.getByText('Invite anyone by username').click();
    const invitePanel = primaryPage.locator('.invite-fallback');
    await invitePanel
      .getByLabel('Username')
      .fill(process.env.DEMO_FRIEND_USERNAME);
    await invitePanel
      .getByRole('button', { name: 'Invite by username' })
      .click();

    await friendPage.goto('/boxes');
    const invitation = friendPage.locator('.social-row', { hasText: boxName });
    await invitation.getByRole('button', { name: 'Accept' }).click();
    await friendPage.locator('.box-card', { hasText: boxName }).click();
    await expect(friendPage).toHaveURL(/\/boxes\/[0-9a-f-]+/);

    await primaryPage.goto(boxUrl);
    await friendPage.goto(boxUrl);
    await friendPage.getByRole('textbox', { name: 'Post' }).waitFor();
    await friendHomePage.goto('/home');
    await expect(
      friendHomePage.getByRole('heading', { name: 'Home', exact: true }),
    ).toBeVisible();
    await primaryPage.getByRole('textbox', { name: 'Post' }).fill(postText);
    await primaryPage.getByRole('button', { name: 'Share post' }).click();

    await expect(friendPage.getByText(postText, { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      friendHomePage.getByText(postText, { exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    const createdPost = primaryPage.getByRole('article').filter({
      hasText: postText,
    });
    await createdPost.getByRole('button', { name: /Manage post by/ }).click();
    await createdPost.getByRole('button', { name: 'Edit post' }).click();
    await createdPost.getByLabel('Edit post').fill(editedText);
    await createdPost.getByRole('button', { name: 'Save changes' }).click();
    await expect(friendPage.getByText(editedText, { exact: true })).toBeVisible(
      {
        timeout: 10_000,
      },
    );
    await expect(
      friendHomePage.getByText(editedText, { exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    const editedPost = primaryPage.getByRole('article').filter({
      hasText: editedText,
    });
    await editedPost.getByRole('button', { name: /Manage post by/ }).click();
    primaryPage.once('dialog', (dialog) => dialog.accept());
    await editedPost.getByRole('button', { name: 'Delete post' }).click();
    await expect(friendPage.getByText(editedText, { exact: true })).toHaveCount(
      0,
      { timeout: 10_000 },
    );
    await expect(
      friendHomePage.getByText(editedText, { exact: true }),
    ).toHaveCount(0, { timeout: 10_000 });
  } finally {
    if (boxUrl) {
      await primaryPage.goto(boxUrl).catch(() => undefined);
      const confirmation = primaryPage.getByLabel(
        `Type “${boxName}” to confirm`,
      );
      if (await confirmation.isVisible().catch(() => false)) {
        await confirmation.fill(boxName);
        primaryPage.once('dialog', (dialog) => dialog.accept());
        await primaryPage
          .getByRole('button', { name: 'Delete Box permanently' })
          .click();
      }
    }
    await Promise.all([primaryContext.close(), friendContext.close()]);
  }
});

async function signIn(
  page: Page,
  account: { email: string; password: string },
) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
}
