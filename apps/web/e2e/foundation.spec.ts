import { expect, test } from '@playwright/test';

test('renders the Paldora foundation and brand promise', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /a box for your people/i }),
  ).toBeVisible();
  await expect(page.getByText('Private by default')).toBeVisible();
  await expect(page).toHaveTitle(/Paldora/);
});
