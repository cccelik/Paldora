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
