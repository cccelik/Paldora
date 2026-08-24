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
  test.setTimeout(60_000);
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
  const commentText = `Realtime comment ${marker}`;
  const photoText = `Photo post ${marker}`;
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

    await primaryPage.getByRole('button', { name: 'Manage Box' }).click();
    await primaryPage
      .getByText('Invite anyone by username', { exact: true })
      .click();
    const invitePanel = primaryPage.locator('.invite-fallback');
    await invitePanel
      .getByLabel('Username')
      .fill(process.env.DEMO_FRIEND_USERNAME);
    await invitePanel
      .getByRole('button', { name: 'Invite by username' })
      .click();
    await expect(
      primaryPage.getByRole('status').filter({ hasText: 'Invitation sent.' }),
    ).toBeVisible();
    await expect(
      primaryPage.getByRole('dialog', { name: 'Manage Box' }),
    ).toBeVisible();

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

    const friendCreatedPost = friendPage.getByRole('article').filter({
      hasText: postText,
    });
    await friendCreatedPost
      .getByRole('button', { name: 'React', exact: true })
      .click();
    const friendLoveButton = friendCreatedPost.getByRole('menuitemradio', {
      name: 'React with ❤️',
    });
    await friendLoveButton.click();
    await expect(
      friendCreatedPost.getByRole('button', {
        name: 'Change your reaction from ❤️',
      }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      primaryPage
        .getByRole('article')
        .filter({ hasText: postText })
        .getByRole('button', { name: '❤️, 1 reaction' }),
    ).toBeVisible({ timeout: 10_000 });
    await friendCreatedPost.getByRole('button', { name: '0 comments' }).click();
    await friendCreatedPost.getByLabel('Write a comment…').fill(commentText);
    await friendCreatedPost
      .getByRole('button', { name: 'Comment', exact: true })
      .click();
    const primaryCreatedPost = primaryPage.getByRole('article').filter({
      hasText: postText,
    });
    await expect(
      primaryCreatedPost.getByRole('button', { name: '1 comment' }),
    ).toBeVisible({ timeout: 10_000 });
    await primaryCreatedPost.getByRole('button', { name: '1 comment' }).click();
    await expect(
      primaryCreatedPost.getByText(commentText, { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    const primaryComment = primaryCreatedPost
      .locator('.comment-item')
      .filter({ hasText: commentText })
      .first();
    await primaryComment
      .getByRole('button', { name: /React to .*'s comment/ })
      .click();
    await primaryComment
      .getByRole('menuitemradio', { name: 'React with ❤️' })
      .click();
    await expect(
      primaryComment.getByRole('button', {
        name: /Change your reaction to .*'s comment from ❤️/,
      }),
    ).toBeVisible();
    const friendComment = friendCreatedPost
      .locator('.comment-item')
      .filter({ hasText: commentText })
      .first();
    await expect(
      friendComment.getByRole('button', { name: '❤️, 1 reaction' }),
    ).toBeVisible({ timeout: 10_000 });
    const friendNotificationPage = await friendContext.newPage();
    await friendNotificationPage.goto('/notifications');
    await expect(
      friendNotificationPage
        .getByText('reacted to your comment.', { exact: true })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
    await friendNotificationPage.close();
    const notificationPage = await primaryContext.newPage();
    await notificationPage.goto('/notifications');
    await expect(
      notificationPage
        .getByText('reacted to your post.', { exact: true })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      notificationPage
        .getByText('commented on your post.', { exact: true })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
    await notificationPage.close();

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
    const deletedToast = primaryPage.getByRole('status').filter({
      hasText: 'Post deleted.',
    });
    await expect(deletedToast).toBeVisible();
    await expect(deletedToast).toHaveClass(/toast-success/);
    await expect(
      deletedToast.locator('.toast-countdown-progress'),
    ).toBeVisible();
    await deletedToast.getByRole('button', { name: 'Dismiss message' }).click();
    await expect(deletedToast).not.toBeVisible();
    await expect(friendPage.getByText(editedText, { exact: true })).toHaveCount(
      0,
      { timeout: 10_000 },
    );
    await expect(
      friendHomePage.getByText(editedText, { exact: true }),
    ).toHaveCount(0, { timeout: 10_000 });

    await primaryPage.getByRole('textbox', { name: 'Post' }).fill(photoText);
    await primaryPage.locator('input[type="file"]').setInputFiles({
      name: 'paldora-test.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await primaryPage.getByRole('button', { name: 'Share post' }).click();
    const photoSharedToast = primaryPage.getByRole('status').filter({
      hasText: 'Post shared. Photos may take a moment to finish.',
    });
    await expect(photoSharedToast).toBeVisible();
    const homePhotoPost = friendHomePage.getByRole('article').filter({
      hasText: photoText,
    });
    await expect(homePhotoPost).toBeVisible({ timeout: 10_000 });
    await expect(
      homePhotoPost.getByRole('img', { name: /Photo 1 shared by/ }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(photoSharedToast).not.toBeVisible({ timeout: 7_000 });
    await homePhotoPost
      .getByRole('button', { name: /Open photo 1 from/ })
      .click();
    const photoViewer = friendHomePage.getByRole('dialog', {
      name: /Photo viewer for/,
    });
    await expect(photoViewer).toBeVisible();
    await expect(
      photoViewer.getByRole('button', { name: 'Save' }),
    ).toBeVisible();
    await expect(
      photoViewer.getByRole('button', { name: 'Share' }),
    ).toBeVisible();
    await photoViewer
      .getByRole('button', { name: 'Close photo viewer' })
      .click();
    const photoPostElementId = await homePhotoPost.getAttribute('id');
    expect(photoPostElementId).toMatch(/^post-[0-9a-f-]+$/);
    if (!photoPostElementId) throw new Error('Photo post ID is missing.');
    const photoPostId = photoPostElementId.slice('post-'.length);
    const permalinkPage = await friendContext.newPage();
    await permalinkPage.goto(`/posts/${photoPostId}`);
    await expect(
      permalinkPage.getByText(photoText, { exact: true }),
    ).toBeVisible();
    await expect(
      permalinkPage.getByRole('img', { name: /Photo 1 shared by/ }),
    ).toBeVisible();
    await permalinkPage.close();
  } finally {
    if (boxUrl) {
      await primaryPage.goto(boxUrl).catch(() => undefined);
      const manageBox = primaryPage.getByRole('button', {
        name: 'Manage Box',
      });
      if (await manageBox.isVisible().catch(() => false)) {
        await manageBox.click();
      }
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

test('two hosted accounts share one Life Update across private Box threads', async ({
  browser,
}) => {
  test.setTimeout(120_000);
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
  const marker = Date.now();
  const firstName = `Life Alpha ${marker}`;
  const secondName = `Life Beta ${marker}`;
  const originalText = `Life Update ${marker}`;
  const editedText = `${originalText} edited`;
  const createdBoxes: { name: string; url: string }[] = [];
  try {
    await signIn(primaryPage, primary);
    await signIn(friendPage, friend);
    createdBoxes.push(
      await createBoxAndInvite(
        primaryPage,
        firstName,
        process.env.DEMO_FRIEND_USERNAME,
      ),
      await createBoxAndInvite(
        primaryPage,
        secondName,
        process.env.DEMO_FRIEND_USERNAME,
      ),
    );
    await friendPage.goto('/boxes');
    await friendPage
      .locator('.social-row', { hasText: firstName })
      .getByRole('button', { name: 'Accept' })
      .click();
    await friendPage
      .locator('.social-row', { hasText: secondName })
      .getByRole('button', { name: 'Accept' })
      .click();

    await primaryPage.goto('/life-updates/new');
    await primaryPage.getByLabel(firstName).check();
    await primaryPage.getByLabel(secondName).check();
    await primaryPage.getByLabel('Life lately').fill(originalText);
    await primaryPage.locator('input[type="file"]').setInputFiles({
      name: 'life-update.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await primaryPage
      .getByRole('button', { name: 'Publish Life Update' })
      .click();
    await expect(primaryPage).toHaveURL(/\/life-updates\/[0-9a-f-]+$/);
    await expect(primaryPage.getByRole('tab')).toHaveCount(2);
    await expect(
      primaryPage.getByRole('img', { name: /Photo 1 shared by/ }),
    ).toBeVisible({ timeout: 20_000 });

    await friendPage.goto('/home');
    const groupedCard = friendPage.locator('.life-update-card', {
      hasText: originalText,
    });
    await expect(groupedCard).toHaveCount(1);
    await expect(groupedCard.getByRole('tab')).toHaveCount(2);
    await groupedCard.getByRole('button', { name: '0 comments' }).click();
    await groupedCard
      .getByLabel('Write a comment…')
      .fill(`Private Alpha comment ${marker}`);
    await groupedCard
      .getByRole('button', { name: 'Comment', exact: true })
      .click();
    await expect(
      groupedCard.getByRole('button', { name: '1 comment' }),
    ).toBeVisible();
    await groupedCard.getByRole('tab', { name: secondName }).click();
    await expect(
      groupedCard.getByRole('button', { name: '0 comments' }),
    ).toBeVisible();

    await friendPage.goto('/notifications');
    await expect(
      friendPage
        .getByText('shared a Life Update with you.', { exact: true })
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    await primaryPage
      .getByRole('button', { name: 'Manage Life Update' })
      .click();
    await primaryPage.getByRole('link', { name: 'Edit update' }).click();
    await primaryPage.getByLabel('Life lately').fill(editedText);
    await primaryPage.getByRole('button', { name: 'Save Life Update' }).click();
    await expect(
      primaryPage.getByText(editedText, { exact: true }),
    ).toBeVisible();
    await friendPage.goto('/home');
    await expect(
      friendPage.getByText(editedText, { exact: true }),
    ).toBeVisible();
    await friendPage.goto('/memories');
    await expect(friendPage.getByRole('link', { name: /2026/ })).toBeVisible();

    await primaryPage.goto('/life-updates/new');
    await primaryPage.getByLabel('Only Me').check();
    await primaryPage.getByLabel('Reading').fill(`Private note ${marker}`);
    await primaryPage
      .getByRole('button', { name: 'Publish Life Update' })
      .click();
    await expect(
      primaryPage.getByText('Only Me', { exact: true }),
    ).toBeVisible();
    await expect(
      primaryPage.getByRole('button', { name: 'React', exact: true }),
    ).toHaveCount(0);
  } finally {
    await createdBoxes.reduce(async (previous, box) => {
      await previous;
      await deleteHostedBox(primaryPage, box).catch(() => undefined);
    }, Promise.resolve());
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

async function createBoxAndInvite(
  page: Page,
  name: string,
  username: string,
): Promise<{ name: string; url: string }> {
  await page.goto('/boxes/new');
  await page.getByLabel('Box name').fill(name);
  await page.getByRole('button', { name: 'Create private Box' }).click();
  await expect(page).toHaveURL(/\/boxes\/[0-9a-f-]+/);
  const url = page.url();
  await page.getByRole('button', { name: 'Manage Box' }).click();
  await page.getByText('Invite anyone by username', { exact: true }).click();
  const invitePanel = page.locator('.invite-fallback');
  await invitePanel.getByLabel('Username').fill(username);
  await invitePanel.getByRole('button', { name: 'Invite by username' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Invitation sent.' }),
  ).toBeVisible();
  return { name, url };
}

async function deleteHostedBox(
  page: Page,
  box: { name: string; url: string },
): Promise<void> {
  await page.goto(box.url);
  await page.getByRole('button', { name: 'Manage Box' }).click();
  const confirmation = page.getByLabel(`Type “${box.name}” to confirm`);
  await confirmation.fill(box.name);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Box permanently' }).click();
}
