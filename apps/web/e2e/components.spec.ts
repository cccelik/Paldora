import { expect, test } from '@playwright/test';

test('shared settings components compose at responsive widths', async ({
  page,
}) => {
  await page.goto('/design-preview/phase-1?screen=settings');
  await expect(
    page.getByRole('heading', { name: 'Account settings' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Profile information' }),
  ).toBeVisible();
  await expect(page.getByLabel('Username')).toHaveAttribute('minlength', '3');
  await expect(page.getByLabel('Username')).toHaveAttribute('maxlength', '30');
});

test('shared feedback exposes an accessible error role', async ({ page }) => {
  await page.goto('/design-preview/phase-1?screen=username-error');
  await expect(page.locator('.form-notice[role="alert"]')).toHaveText(
    'Username unavailable. Try another one.',
  );
});

test('text posts compose into a responsive chronological feed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/design-preview/components');
  await expect(
    page.getByRole('textbox', { name: 'Post' }).first(),
  ).toHaveAttribute('maxlength', '5000');
  await expect(
    page.getByRole('button', { name: 'Share post' }),
  ).not.toBeVisible();
  await page.getByRole('textbox', { name: 'Post' }).first().click();
  await expect(page.getByRole('button', { name: 'Share post' })).toBeVisible();
  const feed = page.getByRole('region', { name: 'Posts' });
  await expect(feed.getByRole('article')).toHaveCount(2);
  await expect(feed.getByText('Alice Moreno', { exact: true })).toBeVisible();
  await expect(
    feed.getByText('Readers after dark', { exact: true }),
  ).toHaveCount(2);
  await expect(feed.getByText('Edit post')).toHaveCount(0);
  await feed
    .getByRole('button', { name: 'Manage post by Alice Moreno' })
    .click();
  await feed.getByRole('button', { name: 'Edit post' }).click();
  await expect(
    page.getByRole('button', { name: 'Save changes' }),
  ).toBeVisible();
  await feed
    .getByRole('button', { name: 'Manage post by Alice Moreno' })
    .click();
  await expect(feed.getByRole('button', { name: 'Delete post' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Load older posts' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('Box invite panel shows five friends and expands the complete list', async ({
  page,
}) => {
  await page.goto('/design-preview/components');
  await expect(page.getByRole('button', { name: 'Invited' })).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Invite', exact: true }),
  ).toHaveCount(4);
  await page.getByRole('button', { name: 'Show all friends (6)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite friends' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Invited' })).toBeDisabled();
  await expect(
    dialog.getByRole('button', { name: 'Invite', exact: true }),
  ).toHaveCount(5);
  await dialog.getByRole('button', { name: 'Close friend list' }).click();
  await expect(dialog).not.toBeVisible();

  await page.getByText('Invite anyone by username').click();
  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Invite by username' }),
  ).toBeVisible();
  await expect(
    page.getByText('They do not need to be your friend.'),
  ).toBeVisible();
});

test('Box owner sees member role and removal controls', async ({ page }) => {
  await page.goto('/design-preview/components');
  await page.getByRole('button', { name: 'Manage Maya Chen' }).click();
  await expect(
    page.getByRole('button', { name: 'Remove admin' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Remove', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Manage Noah Williams' }).click();
  await expect(page.getByRole('button', { name: 'Make admin' })).toHaveCount(1);
  const promoteForm = page.locator('form', {
    has: page.getByRole('button', { name: 'Make admin' }),
  });
  await promoteForm.evaluate((form) => {
    form.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.documentElement.dataset.overflowSubmit = 'received';
      },
      { capture: true, once: true },
    );
  });
  await page.getByRole('button', { name: 'Make admin' }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-overflow-submit',
    'received',
  );
  await expect(page.getByRole('button', { name: 'Remove admin' })).toHaveCount(
    0,
  );
  await expect(
    page.locator('.member-username', { hasText: '@noah_w' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Manage Rina Patel' }).click();
  await expect(page.getByRole('button', { name: 'Add friend' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Remove', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Transfer ownership' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Transfer ownership to another member before leaving this Box.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Box settings' }),
  ).toBeVisible();
  await expect(page.getByLabel('Box name')).toHaveValue('Readers after dark');
  await expect(page.getByRole('button', { name: 'Archive Box' })).toBeVisible();
  await expect(
    page.getByLabel('Type “Readers after dark” to confirm'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Delete Box permanently' }),
  ).toBeVisible();
});
