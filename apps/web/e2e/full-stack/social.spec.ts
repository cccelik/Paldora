import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectAccessible, expectNoOverflow } from '../support/a11y';
import { provisionAccount, type Account } from '../support/accounts';
import { personOnOwnSession, signedIn } from '../support/sessions';
function rowFor(scope: Page | Locator, username: string) {
  return scope.getByRole('listitem').filter({ hasText: `@${username}` });
}

async function befriend(
  ada: Page,
  grace: Page,
  graceAccount: Account,
  adaAccount: Account,
) {
  await ada.goto('/friends');
  await ada.getByLabel('Their username').fill(graceAccount.username);
  await ada.getByRole('button', { name: 'Send request' }).click();
  await expect(ada.getByText('Friend request sent.')).toBeVisible();
  await grace.goto('/friends');
  await rowFor(grace, adaAccount.username)
    .getByRole('button', { name: 'Accept' })
    .click();
  await expect(
    rowFor(grace, adaAccount.username).getByRole('button', { name: 'Remove' }),
  ).toBeVisible();
}

test('two people become friends and one ends it', async ({ page, browser }) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);

  await page.goto('/friends');
  await expectAccessible(page);
  await expectNoOverflow(page);
  await page.getByLabel('Their username').fill(graceAccount.username);
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('Friend request sent.')).toBeVisible();
  await expect(
    rowFor(page, graceAccount.username).getByText('Waiting for a reply'),
  ).toBeVisible();

  await grace.page.goto('/friends');
  await expect(
    rowFor(grace.page, adaAccount.username).getByRole('button', {
      name: 'Accept',
    }),
  ).toBeVisible();
  await expectAccessible(grace.page);
  await rowFor(grace.page, adaAccount.username)
    .getByRole('button', { name: 'Accept' })
    .click();
  await expect(
    rowFor(grace.page, adaAccount.username).getByRole('button', {
      name: 'Remove',
    }),
  ).toBeVisible();

  await page.reload();
  await rowFor(page, graceAccount.username)
    .getByRole('button', { name: 'Remove' })
    .click();
  // The confirmation moves focus to the safe choice.
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    rowFor(page, graceAccount.username).getByRole('button', { name: 'Remove' }),
  ).toBeFocused();
  await rowFor(page, graceAccount.username)
    .getByRole('button', { name: 'Remove' })
    .click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByText('No friends yet.')).toBeVisible();
  await grace.context.close();
});

test('blocking hides you without telling anyone', async ({ page, browser }) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);
  await befriend(page, grace.page, graceAccount, adaAccount);

  await page.goto('/friends');
  const blocked = page.getByRole('region', { name: 'Blocked people' });
  await blocked
    .getByLabel('Block someone by username')
    .fill(graceAccount.username);
  await blocked.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(rowFor(blocked, graceAccount.username)).toBeVisible();
  await expect(page.getByText('No friends yet.')).toBeVisible();

  // Grace is not told. Reaching out looks exactly like an unknown username.
  await grace.page.goto('/friends');
  await expect(grace.page.getByText('No friends yet.')).toBeVisible();
  await grace.page.getByLabel('Their username').fill(adaAccount.username);
  await grace.page.getByRole('button', { name: 'Send request' }).click();
  await expect(
    grace.page.getByText('No one with that username was found.'),
  ).toBeVisible();
  await expect(
    grace.page.getByText('You haven’t blocked anyone.'),
  ).toBeVisible();

  // Ada knows she blocked Grace, and can undo it.
  await page.getByLabel('Their username').fill(graceAccount.username);
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(
    page.getByText('You blocked this person. Unblock them first.'),
  ).toBeVisible();
  await rowFor(blocked, graceAccount.username)
    .getByRole('button', { name: 'Unblock' })
    .click();
  await expect(page.getByText('You haven’t blocked anyone.')).toBeVisible();
  await grace.context.close();
});

test('a Box grows, changes hands, and is deleted only by typing its name', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);

  await page.goto('/boxes');
  await expect(page.getByText('You’re not in any Boxes yet.')).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel('Box name').fill('Weekend crew');
  await page.getByRole('button', { name: 'Create Box' }).click();
  await expect(page).toHaveURL(/\/boxes\/[0-9a-f-]{36}$/);
  const boxUrl = page.url();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Weekend crew' }),
  ).toBeVisible();
  await expectAccessible(page);
  await expectNoOverflow(page);

  // Invite someone who is not a friend.
  await page.getByLabel('Their username').fill(graceAccount.username);
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText('Invitation sent.')).toBeVisible();
  await expect(
    rowFor(page, graceAccount.username).getByText('Invited'),
  ).toBeVisible();

  // The invitee cannot see the Box until she joins.
  await grace.page.goto(boxUrl);
  await expect(
    grace.page.getByRole('heading', {
      level: 1,
      name: 'This page isn’t here.',
    }),
  ).toBeVisible();
  await grace.page.goto('/boxes');
  await expect(grace.page.getByText(/invited you to/)).toBeVisible();
  await expectAccessible(grace.page);
  await grace.page.getByRole('button', { name: 'Join' }).click();
  await expect(
    grace.page.getByRole('link', { name: 'Weekend crew' }),
  ).toBeVisible();

  await page.reload();
  await expect(
    rowFor(page, graceAccount.username).getByText('Member'),
  ).toBeVisible();
  await rowFor(page, graceAccount.username)
    .getByRole('button', { name: 'Make admin' })
    .click();
  await expect(
    rowFor(page, graceAccount.username).getByText('Admin'),
  ).toBeVisible();

  // The owner must hand the Box over before leaving.
  await expect(
    page.getByText(
      'You own this Box. To leave, make another member the owner first.',
    ),
  ).toBeVisible();
  await rowFor(page, graceAccount.username)
    .getByRole('button', { name: 'Make owner' })
    .click();
  await page.getByRole('button', { name: 'Yes, transfer' }).click();
  await expect(
    page.getByRole('button', { name: 'Leave this Box' }),
  ).toBeVisible();
  await expect(page.getByLabel(/Type “Weekend crew” to confirm/)).toHaveCount(
    0,
  );

  // Grace now owns it: deletion needs the exact name and a tick.
  await grace.page.goto(boxUrl);
  await expect(
    grace.page.getByRole('heading', { name: 'Delete this Box' }),
  ).toBeVisible();
  const destroy = grace.page.getByRole('button', {
    name: 'Delete this Box forever',
  });
  await expect(destroy).toBeDisabled();
  await grace.page
    .getByLabel(/Type “Weekend crew” to confirm/)
    .fill('weekend crew');
  await grace.page.getByRole('checkbox').check();
  await expect(destroy).toBeDisabled();
  await grace.page
    .getByLabel(/Type “Weekend crew” to confirm/)
    .fill('Weekend crew');
  await expect(destroy).toBeEnabled();
  await destroy.click();
  await expect(grace.page).toHaveURL(/\/boxes$/);
  await expect(
    grace.page.getByText('You’re not in any Boxes yet.'),
  ).toBeVisible();

  await page.goto(boxUrl);
  await expect(
    page.getByRole('heading', { level: 1, name: 'This page isn’t here.' }),
  ).toBeVisible();
  await grace.context.close();
});

test('a stranger sees the same page for a real Box and a made-up one', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const strangerAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  await page.goto('/boxes');
  await page.getByLabel('Box name').fill('Private');
  await page.getByRole('button', { name: 'Create Box' }).click();
  await expect(page).toHaveURL(/\/boxes\/[0-9a-f-]{36}$/);
  const realUrl = page.url();

  const stranger = await personOnOwnSession(browser, strangerAccount);
  const real = await stranger.page.goto(realUrl);
  const madeUp = await stranger.page.goto(
    '/boxes/00000000-0000-4000-8000-000000000000',
  );
  const malformed = await stranger.page.goto('/boxes/not-a-uuid');
  expect([real?.status(), madeUp?.status(), malformed?.status()]).toEqual([
    404, 404, 404,
  ]);
  await expect(
    stranger.page.getByRole('heading', {
      level: 1,
      name: 'This page isn’t here.',
    }),
  ).toBeVisible();
  await stranger.context.close();
});
