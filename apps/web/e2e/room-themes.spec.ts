import { ROOM_THEME_PRESETS } from '@paldora/domain';
import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoOverflow } from './support/a11y';

/**
 * The Room canvas in all 14 presets (Figma page 07), at desktop width and at
 * 390px: axe (WCAG 2.2 AA, including color contrast) on the themed canvas,
 * and no horizontal overflow. Runs against the local-only fixture route.
 */
test.describe('Room themes', () => {
  for (const theme of ROOM_THEME_PRESETS) {
    test(`${theme} is accessible and fits the viewport`, async ({ page }) => {
      const response = await page.goto(`/design-preview/rooms/${theme}`);
      expect(response?.status()).toBe(200);
      const canvas = page.locator('.room-canvas');
      await expect(canvas).toHaveAttribute('data-room-theme', theme);
      await expect(
        canvas.getByRole('heading', { name: 'Alice Moreau', level: 1 }),
      ).toBeVisible();
      // The theme stylesheet is really applied (an unthemed canvas would pass axe).
      await expect
        .poll(() =>
          canvas.evaluate((el) =>
            getComputedStyle(el).getPropertyValue('--room-canvas').trim(),
          ),
        )
        .not.toBe('');
      await expectAccessible(page);
      await expectNoOverflow(page);
    });
  }

  test('an unknown preset answers 404', async ({ page }) => {
    const response = await page.goto('/design-preview/rooms/not_a_theme');
    expect(response?.status()).toBe(404);
  });
});
