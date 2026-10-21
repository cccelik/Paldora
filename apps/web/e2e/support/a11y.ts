import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.help}`),
    // Where each violation is, so a failure names the element.
    JSON.stringify(
      results.violations.map((v) =>
        v.nodes.map((n) => [n.target, n.failureSummary]),
      ),
    ),
  ).toEqual([]);
}

export async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function expectSound(page: Page) {
  await expectAccessible(page);
  await expectNoOverflow(page);
}
/** Sticky navigation can overlap controls after a save scrolls the page. */
export async function expectAccessibleFromTop(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectAccessible(page);
}
