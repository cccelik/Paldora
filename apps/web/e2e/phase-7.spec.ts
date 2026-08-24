import { expect, test } from '@playwright/test';

const themes = [
  'obsidian_gold',
  'cream_paper',
  'lavender_dream',
  'ocean_glow',
  'daisy_day',
  'neon_night',
  'y2k_glitter',
  'dark_academia',
  'frutiger_aero',
  'tumblr_2014',
  'retro_windows',
  'cyberpunk',
  'minimal_editorial',
  'polaroid_scrapbook',
] as const;

test('Room responses keep trusted security boundaries', async ({ page }) => {
  const response = await page.goto('/design-preview/phase-7');
  expect(response?.headers()['content-security-policy']).toContain(
    "frame-ancestors 'none'",
  );
  expect(response?.headers()['permissions-policy']).toContain('camera=(self)');
  await expect(page.locator('.room-canvas .room-trusted-toolbar')).toHaveCount(
    0,
  );
});

test('all Room themes use the same semantic, scoped canvas', async ({
  page,
}) => {
  for (const theme of themes) {
    await page.goto(`/design-preview/phase-7?theme=${theme}`);
    const room = page.locator('.room-canvas');
    await expect(room).toHaveAttribute('data-room-theme', theme);
    await expect(
      room.getByRole('heading', { name: 'Alice Moreno' }),
    ).toBeVisible();
    await expect(room.getByRole('heading', { name: 'Music' })).toBeVisible();
    await expect(room.getByRole('heading', { name: 'Posts' })).toBeVisible();
    await expect(page.getByText('Friends Only')).toBeVisible();
  }
});

test('Room is responsive at 390px without leaking trusted controls into the theme', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/design-preview/phase-7?theme=polaroid_scrapbook');
  await expect
    .poll(() =>
      page
        .locator('.room-canvas')
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    )
    .toBe(true);
  await expect(page.locator('.room-widget-layout')).toHaveCSS(
    'grid-template-columns',
    /.+/,
  );
  await expect(page.locator('.mobile-nav')).toBeVisible();
  await expect(page.locator('.room-canvas .mobile-nav')).toHaveCount(0);
});

test('structured editor switches theme, preview width, and widget order accessibly', async ({
  page,
}) => {
  await page.goto('/design-preview/phase-7?screen=editor');
  await page.getByLabel('Theme preset').selectOption('cyberpunk');
  await expect(
    page.locator('.room-preview-frame .room-canvas'),
  ).toHaveAttribute('data-room-theme', 'cyberpunk');
  await page.getByRole('button', { name: 'Mobile' }).click();
  await expect(page.locator('.room-preview-frame')).toHaveClass(/mobile/);
  const rows = page.locator('.room-widget-editor-list li');
  await expect(rows.first()).toContainText('currently');
  await expect(rows.first()).toHaveAttribute('draggable', 'true');
  await rows
    .first()
    .getByRole('button', { name: 'Move currently down' })
    .click();
  await expect(rows.first()).toContainText('music');
});

test('Top Friends filtering preserves selection and enforces the selected layout', async ({
  page,
}) => {
  await page.goto('/design-preview/phase-7?screen=top-friends');
  await page.getByLabel('Find a friend').fill('Lina');
  await expect(page.getByText('Lina Park')).toBeVisible();
  await expect(page.getByText('Maya Chen')).toHaveCount(1);
  await page.getByLabel('Find a friend').fill('');
  await page.getByLabel('Layout').selectOption('8');
  await page.getByLabel('Visibility').selectOption('friends');
  await page
    .locator('.room-friend-picker > label')
    .filter({ hasText: 'Lina Park' })
    .getByRole('checkbox')
    .check();
  await expect(page.locator('.room-selected-friends li')).toHaveCount(5);
});

test('music cards are safe links and app appearance persists locally', async ({
  page,
}) => {
  await page.goto('/design-preview/phase-7?screen=music');
  const musicLinks = page.locator('.room-music-card');
  await expect(musicLinks).toHaveCount(2);
  await expect(musicLinks.first()).toHaveAttribute('href', /^https:\/\//);
  await expect(musicLinks.first()).toHaveAttribute('rel', /noreferrer/);

  let appearance = 'system';
  await page.route('**/api/v1/me/preferences', async (route) => {
    if (route.request().method() === 'PATCH') {
      appearance = (route.request().postDataJSON() as { appearance: string })
        .appearance;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ appearance, updatedAt: new Date().toISOString() }),
    });
  });
  await page.goto('/design-preview/phase-7?screen=appearance');
  await page.getByLabel('Dark').check();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await page.getByRole('button', { name: 'Save appearance' }).click();
  await expect(page.getByText('Appearance saved.')).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
});
