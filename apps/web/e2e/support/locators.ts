import { expect, type Locator, type Page } from '@playwright/test';
/** Keyboard only: Tab forward until `target` has focus. */
export async function tabTo(page: Page, target: Locator, limit = 80) {
  for (let step = 0; step < limit; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

export const postOn = (page: Page) =>
  page.getByRole('article', { name: /Post by/ });
