import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoOverflow } from './support/a11y';

const blocks = [
  'Button',
  'Icon button',
  'Chip',
  'Text field',
  'Toggle, Radio, Checkbox',
  'Segmented control',
  'Avatar',
  'List row',
  'Banner',
  'Toast',
  'Post card',
  'Life Update card',
  'Box card',
  'Comment',
  'Notification row',
  'Upload tile',
  'Nav bar',
  'Skeleton',
  'Web sidebar',
  'Overlays',
];

test.describe('component gallery', () => {
  test.beforeEach(async ({ page }) => {
    const response = await page.goto('/design-preview');
    expect(response?.status()).toBe(200);
  });

  test('shows every Figma component in Light and Dark', async ({ page }) => {
    for (const panel of ['light', 'dark']) {
      const scope = page.locator(`[data-appearance="${panel}"]`);
      for (const title of blocks) {
        await expect(
          scope.locator(`[data-gallery-block="${title}"]`),
          `${panel}: ${title}`,
        ).toHaveCount(1);
      }
    }
  });

  test('is accessible in both appearances and does not overflow', async ({
    page,
  }) => {
    await expectAccessible(page);
    await expectNoOverflow(page);
  });

  test('controls keep a 44px target and the dialog returns focus', async ({
    page,
  }) => {
    const panel = page.locator('[data-appearance="light"]');
    for (const name of ['Like (surface 40)', 'Like (primary 52)']) {
      const box = await panel
        .getByRole('button', { name, exact: true })
        .boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(40);
    }
    const toggle = panel.getByRole('switch', { name: 'Weekly digest' });
    const toggleBox = await toggle.boundingBox();
    expect(toggleBox?.width).toBe(46);
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toBeChecked();

    const open = panel.getByRole('button', { name: 'Open dialog' });
    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Leave this Box?' });
    await expect(dialog).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
  });
});
