import { expect, test } from '@playwright/test';

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
  test(`${account.label} can authenticate and access Phase 2`, async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/home$/);

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
