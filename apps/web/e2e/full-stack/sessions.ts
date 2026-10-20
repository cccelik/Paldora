import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { signIn, type Account } from './accounts';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

export async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Signs in and waits until the app has actually landed on Home. */
export async function signedIn(page: Page, account: Account) {
  await signIn(page, account);
  await expect(page).toHaveURL(/\/home$/);
}

/** Another person in their own session, on the same device profile. */
export async function personOnOwnSession(
  browser: Browser,
  account: Account,
): Promise<{ page: Page; context: BrowserContext }> {
  const { viewport, isMobile, hasTouch, userAgent, baseURL } =
    test.info().project.use;
  const context = await browser.newContext({
    ...(viewport ? { viewport } : {}),
    ...(isMobile !== undefined ? { isMobile } : {}),
    ...(hasTouch !== undefined ? { hasTouch } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(baseURL ? { baseURL } : {}),
  });
  const page = await context.newPage();
  await signedIn(page, account);
  return { page, context };
}

/** Ada makes a Box and Grace joins it, both through the real screens. */
export async function sharedBox(
  ada: Page,
  grace: Page,
  graceAccount: Account,
  name = 'Weekend crew',
) {
  await ada.goto('/boxes');
  await ada.getByLabel('Box name').fill(name);
  await ada.getByRole('button', { name: 'Create Box' }).click();
  await expect(ada).toHaveURL(/\/boxes\/[0-9a-f-]{36}$/);
  const url = ada.url();
  await ada.getByLabel('Their username').fill(graceAccount.username);
  await ada.getByRole('button', { name: 'Send invitation' }).click();
  await expect(ada.getByText('Invitation sent.')).toBeVisible();
  await grace.goto('/boxes');
  await grace.getByRole('button', { name: 'Join' }).click();
  await expect(grace.getByRole('link', { name })).toBeVisible();
  return url;
}

/** Keyboard only: Tab forward until `target` has focus. */
export async function tabTo(page: Page, target: Locator, limit = 80) {
  for (let step = 0; step < limit; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

/** Writes one section and shares to the named Boxes through the composer. */
export async function shareLifeUpdate(
  page: Page,
  text: string,
  audience: { boxes: readonly string[] } | 'only_me',
) {
  await page.goto('/life-updates/new');
  await page.getByLabel('Life lately').fill(text);
  if (audience === 'only_me') {
    await page.getByRole('radio', { name: 'Only me' }).check();
  } else {
    for (const name of audience.boxes) {
      await page.getByRole('checkbox', { name }).check();
    }
  }
  await page.getByRole('button', { name: 'Share Life Update' }).click();
  await expect(page).toHaveURL(/\/life-updates\/[0-9a-f-]{36}$/);
  await expect(page.getByText(text)).toBeVisible();
  return page.url();
}
