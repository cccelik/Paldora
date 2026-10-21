import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { signIn, type Account } from './accounts';
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

export { expectAccessible, expectNoOverflow } from './a11y';
export { sharedBox, shareLifeUpdate } from './flows';
export { tabTo } from './locators';
