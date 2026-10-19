import { expect, test } from '@playwright/test';

test('multi-Box composer is searchable and responsive', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/design-preview/phase-6?screen=composer');
  await expect(
    page.getByRole('heading', { name: 'New Life Update' }),
  ).toBeVisible();
  await page.getByLabel('Readers after dark').check();
  await page.getByLabel('Berlin weekends').check();
  await expect(page.getByText('2/20 Boxes selected.')).toBeVisible();
  await page.getByPlaceholder('Search Boxes').fill('pottery');
  await expect(page.getByLabel('Pottery people')).toBeVisible();
  await expect(page.getByLabel('Readers after dark')).toHaveCount(0);
  await page.getByLabel('Only Me').check();
  await expect(page.getByPlaceholder('Search Boxes')).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator('.life-update-composer')
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    )
    .toBe(true);
});

test('Life Update tabs switch isolated interaction summaries', async ({
  page,
}) => {
  await page.goto('/design-preview/phase-6');
  const card = page.locator('.life-update-card');
  await expect(card.getByRole('tab')).toHaveCount(2);
  await card.getByRole('tab', { name: 'Readers after dark' }).click();
  await expect(card.getByRole('button', { name: '5 comments' })).toBeVisible();
  await expect(
    card.getByRole('button', { name: '🙏, 4 reactions' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    card.getByRole('tab', { name: 'Readers after dark' }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('memory home and month timeline expose the derived archive', async ({
  page,
}) => {
  await page.goto('/design-preview/phase-6?screen=memories');
  await expect(page.getByRole('heading', { name: 'Memories' })).toBeVisible();
  await expect(page.locator('.memory-year-card')).toHaveCount(3);
  await page.goto('/design-preview/phase-6?screen=month');
  await expect(
    page.getByRole('heading', { name: 'August 2026' }),
  ).toBeVisible();
  await expect(page.locator('.memory-entry')).toHaveCount(1);
  await expect(page.getByText('August 18')).toBeVisible();
});
