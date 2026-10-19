import { expect, test } from '@playwright/test';

test('sign-in is demo-only, responsive, and accessible', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible();
  await expect(
    page.getByText('Access is limited to provisioned demo accounts.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /create account/i })).toHaveCount(
    0,
  );
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('password recovery pages expose the complete reset UI', async ({
  page,
}) => {
  await page.goto('/forgot-password');
  await expect(
    page.getByRole('heading', { name: 'Forgot password?' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Send reset link' }),
  ).toBeVisible();
  await page.goto('/reset-password');
  await expect(
    page.getByRole('heading', { name: 'Reset password' }),
  ).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Confirm new password')).toBeVisible();
});
