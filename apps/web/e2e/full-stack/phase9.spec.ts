import { expect, test } from '@playwright/test';
import { provisionAccount } from '../support/accounts';
import {
  expectAccessible,
  expectNoOverflow,
  personOnOwnSession,
  sharedBox,
  signedIn,
} from '../support/sessions';

test('a member reports an accessible post and sees only their own receipt', async ({
  page,
  browser,
}) => {
  const author = provisionAccount({ complete: true });
  const reporter = provisionAccount({ complete: true });
  await signedIn(page, author);
  const other = await personOnOwnSession(browser, reporter);
  const boxUrl = await sharedBox(page, other.page, reporter);
  await page.getByLabel('Share with this Box').fill('A post to report');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText('A post to report')).toBeVisible();

  await other.page.goto(boxUrl);
  const post = other.page.getByRole('article', { name: /Post by/ });
  await post.getByText('Report this post').click();
  await post.getByLabel('Reason').selectOption('privacy');
  await post.getByRole('button', { name: 'Send report' }).click();
  await expect(post.getByText('Report received.')).toBeVisible();
  await other.page.goto('/settings/reports');
  await expect(other.page.getByText('privacy')).toBeVisible();
  await expect(other.page.getByText('Received')).toBeVisible();
  await expectAccessible(other.page);
  await expectNoOverflow(other.page);

  await page.goto('/settings/reports');
  await expect(
    page.getByText('You have not submitted a report.'),
  ).toBeVisible();
  expect((await other.page.goto('/moderation'))?.status()).toBe(404);
  await other.context.close();
});

test('account settings can request a private archive', async ({ page }) => {
  await signedIn(page, provisionAccount({ complete: true }));
  await page.goto('/settings/account');
  await expect(
    page.getByRole('heading', { name: 'Export your data' }),
  ).toBeVisible();
  await expectAccessible(page);
  await expectNoOverflow(page);
  await page.getByRole('button', { name: 'Request an archive' }).click();
  await expect(
    page.getByText('Your archive is being prepared.', { exact: true }),
  ).toBeVisible();
});
