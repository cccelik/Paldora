import { expect, type Page } from '@playwright/test';
import { type Account } from './accounts';
import { postOn } from './locators';
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

export async function post(page: Page, text: string) {
  await page.getByLabel('Share with this Box').fill(text);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText(text)).toBeVisible();
}

/** From a Box page, open the post's own page through its comments link. */
export async function openPermalink(page: Page, boxUrl: string) {
  await page.goto(boxUrl);
  await postOn(page)
    .getByRole('link', { name: 'Comment', exact: true })
    .click();
  await expect(page).toHaveURL(/\/posts\/[0-9a-f-]{36}#comments$/);
  return page.url().replace(/#comments$/, '');
}

export async function comment(page: Page, text: string) {
  const field = page.getByLabel('Add a comment');
  await field.fill(text);
  await field.press('ControlOrMeta+Enter');
  await expect(
    page
      .getByRole('article', { name: /^Comment by/ })
      .filter({ hasText: text }),
  ).toBeVisible();
  await expect(field).toHaveValue('');
}
