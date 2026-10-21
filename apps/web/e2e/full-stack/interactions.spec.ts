import { expect, test, type Page } from '@playwright/test';
import { provisionAccount } from '../support/accounts';
import { apiAs, type Person } from '../support/rooms';
import { comment, openPermalink, post } from '../support/flows';
import { postOn } from '../support/locators';
import {
  expectAccessible,
  expectNoOverflow,
  personOnOwnSession,
  sharedBox,
  signedIn,
} from '../support/sessions';
/** Notifications come from the worker's projector: allow it a few polls. */
const projected = { timeout: 20_000 };
const live = (page: Page) => page.locator('[data-realtime="connected"]');

const bell = (page: Page) => page.getByRole('link', { name: /^Notifications/ });

async function reply(page: Page, to: string, text: string) {
  await page
    .getByRole('article', { name: /^Comment by/ })
    .filter({ hasText: to })
    .getByRole('button', { name: 'Reply', exact: true })
    .click();
  await expect(page.getByText(/^Replying to /)).toBeVisible();
  await page.getByLabel('Write a reply').fill(text);
  await page.getByRole('button', { name: 'Reply', exact: true }).last().click();
  await expect(page.getByText(text)).toBeVisible();
}

/** The optimistic button updates first; reload only after the API stores the choice. */
async function expectStoredReaction(
  person: Person,
  postId: string,
  kind: string | null,
) {
  await expect
    .poll(
      async () => {
        const post = await person.call<{
          interactions: { viewerReaction: { kind: string } | null };
        }>('GET', `/posts/${postId}`);
        return post.interactions.viewerReaction?.kind ?? null;
      },
      { timeout: 10_000 },
    )
    .toBe(kind);
}

test('comments, replies, reactions, and notifications reach the author', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);
  const boxUrl = await sharedBox(page, grace.page, graceAccount);
  await post(page, 'Picnic on Sunday?');

  // Ada waits on Home with the stream connected and nothing unread.
  await page.goto('/home');
  await expect(live(page)).toBeAttached();
  await expect(bell(page)).toHaveAccessibleName('Notifications');

  // Grace comments, replies, and replies to her reply.
  const permalink = await openPermalink(grace.page, boxUrl);
  const graceApi = await apiAs(graceAccount);
  const postId = permalink.split('/').at(-1) ?? '';
  await comment(grace.page, 'Count me in');
  await reply(grace.page, 'Count me in', 'Bringing lemonade');
  await reply(grace.page, 'Bringing lemonade', 'And a blanket');
  const replies = grace.page.getByRole('list', { name: 'Replies' });
  await expect(replies.getByRole('article')).toHaveCount(2);
  await grace.page.reload();
  // A reply to a reply still sits under the root: one level only.
  await expect(
    grace.page.getByRole('list', { name: 'Replies' }).getByRole('article'),
  ).toHaveCount(2);
  await expectAccessible(grace.page);
  await expectNoOverflow(grace.page);

  // A fast double-click on 👍 leaves it set.
  const thumbs = postOn(grace.page).getByRole('button', {
    name: /^React with 👍/,
  });
  await thumbs.dblclick();
  await expectStoredReaction(graceApi, postId, '👍');
  await expect(thumbs).toHaveAttribute('aria-pressed', 'true');
  await grace.page.reload();
  await expect(
    postOn(grace.page).getByRole('button', { name: 'React with 👍. 1 person' }),
  ).toHaveAttribute('aria-pressed', 'true');

  // Any emoji through the chooser replaces it.
  await postOn(grace.page)
    .getByRole('button', { name: 'More reactions' })
    .click();
  const dialog = grace.page.getByRole('dialog', { name: 'Choose a reaction' });
  await expect(dialog).toBeVisible();
  await expectAccessible(grace.page);
  await expectNoOverflow(grace.page);
  await dialog.getByLabel('Any emoji').fill('not an emoji');
  await dialog.getByRole('button', { name: 'Use' }).click();
  await expect(dialog.getByText('Enter one emoji, like 🦄.')).toBeVisible();
  await dialog.getByLabel('Any emoji').fill('🦄');
  await dialog.getByRole('button', { name: 'Use' }).click();
  await expectStoredReaction(graceApi, postId, '🦄');
  await expect(dialog).toBeHidden();
  const unicorn = postOn(grace.page).getByRole('button', {
    name: 'React with 🦄. 1 person',
  });
  await expect(unicorn).toHaveAttribute('aria-pressed', 'true');
  await grace.page.reload();
  await expect(unicorn).toHaveAttribute('aria-pressed', 'true');
  await expect(
    postOn(grace.page).getByRole('button', {
      name: 'React with 👍',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'false');

  // She changes her mind: removes it, then settles on ❤️.
  await unicorn.click();
  await expectStoredReaction(graceApi, postId, null);
  await expect(
    postOn(grace.page).getByRole('button', { name: /^React with 🦄/ }),
  ).toHaveCount(0);
  await grace.page.reload();
  await postOn(grace.page)
    .getByRole('button', { name: 'React with ❤️', exact: true })
    .click();
  await expectStoredReaction(graceApi, postId, '❤️');
  await expect(
    postOn(grace.page).getByRole('button', { name: 'React with ❤️. 1 person' }),
  ).toHaveAttribute('aria-pressed', 'true');

  // Ada's bell counts up without a reload, with a toast that names no one.
  await expect(bell(page)).toHaveAccessibleName(
    'Notifications, 2 unread',
    projected,
  );
  await expect(
    page.getByText('You have a new notification.').first(),
  ).toBeVisible();
  // Her Home card refetched its own summary: no page refresh needed.
  await expect(
    postOn(page).getByRole('link', { name: '3 comments' }),
  ).toBeVisible(projected);
  await expectAccessible(page);
  await expectNoOverflow(page);

  // The notifications page, then the deep link.
  await bell(page).click();
  await expect(page).toHaveURL(/\/notifications$/);
  const rows = page.getByRole('list', { name: 'Notifications' });
  const commented = rows.getByRole('button', {
    name: /commented on your post in Weekend crew/,
  });
  await expect(commented).toContainText('Unread');
  await expect(
    rows.getByRole('button', { name: /reacted ❤️ to your post/ }),
  ).toBeVisible();
  await expectAccessible(page);
  await expectNoOverflow(page);
  await commented.click();
  await expect(page).toHaveURL(
    /\?comment=[0-9a-f-]{36}#comment-[0-9a-f-]{36}$/,
  );
  const commentId = new URL(page.url()).searchParams.get('comment') ?? '';
  expect(page.url().startsWith(permalink)).toBe(true);
  const pinned = page.getByRole('group', { name: 'Linked comment' });
  await expect(pinned.getByText('Count me in')).toBeVisible();
  await expect(page.locator(`#comment-${commentId}`)).toBeFocused();
  await expectAccessible(page);
  await expectNoOverflow(page);

  await page.goto('/notifications');
  await expect(
    rows.getByRole('button', { name: /commented on your post/ }),
  ).not.toContainText('Unread');
  await expect(bell(page)).toHaveAccessibleName('Notifications, 1 unread');
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByText('You’re all caught up.')).toBeVisible();
  await expect(bell(page)).toHaveAccessibleName('Notifications');
  await grace.context.close();
});

test('edits, deletions, and blocks change what others see', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);
  const boxUrl = await sharedBox(page, grace.page, graceAccount);
  await post(page, 'Book club pick');

  const permalink = await openPermalink(grace.page, boxUrl);
  await comment(grace.page, 'Dune, obviously');
  await reply(grace.page, 'Dune, obviously', 'Or Piranesi');
  await postOn(grace.page)
    .getByRole('button', { name: 'React with 😂', exact: true })
    .click();
  await expect(
    postOn(grace.page).getByRole('button', { name: 'React with 😂. 1 person' }),
  ).toBeVisible();

  await page.goto('/notifications');
  await expect(
    page.getByRole('button', { name: /commented on your post/ }),
  ).toBeVisible(projected);

  // Grace edits her comment inline.
  const root = grace.page
    .getByRole('article', { name: /^Comment by/ })
    .filter({ hasText: 'Dune, obviously' });
  await root.getByRole('button', { name: 'Edit' }).click();
  await grace.page.getByLabel('Edit your comment').fill('Dune, definitely');
  await grace.page.getByRole('button', { name: 'Save' }).click();
  await expect(grace.page.getByText('Dune, definitely')).toBeVisible();
  await expect(grace.page.getByText('· edited')).toBeVisible();

  // Deleting a root that has a reply leaves a tombstone, and the comment's
  // notification disappears for Ada.
  await grace.page
    .getByRole('article', { name: /^Comment by/ })
    .filter({ hasText: 'Dune, definitely' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(
    grace.page.getByRole('button', { name: 'Cancel' }),
  ).toBeFocused();
  await grace.page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(grace.page.getByText('This comment was deleted.')).toBeVisible();
  await expect(grace.page.getByText('Dune, definitely')).toHaveCount(0);
  await expect(grace.page.getByText('Or Piranesi')).toBeVisible();
  // Check from the top: axe counts controls scrolled under the sticky
  // header as obscured targets.
  await grace.page.evaluate(() => window.scrollTo(0, 0));
  await expectAccessible(grace.page);

  await page.reload();
  await expect(
    page.getByRole('button', { name: /commented on your post/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /reacted 😂 to your post/ }),
  ).toBeVisible(projected);

  // Ada blocks Grace: her words become placeholders, her reaction stops
  // counting, and the notifications about her vanish.
  await page.goto('/friends');
  const blocked = page.getByRole('region', { name: 'Blocked people' });
  await blocked
    .getByLabel('Block someone by username')
    .fill(graceAccount.username);
  await blocked.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(blocked.getByText(`@${graceAccount.username}`)).toBeVisible();

  await page.goto(permalink);
  await expect(
    page.getByText('A comment here is hidden.').first(),
  ).toBeVisible();
  await expect(page.getByText('Or Piranesi')).toHaveCount(0);
  await expect(
    postOn(page).getByRole('button', { name: 'React with 😂', exact: true }),
  ).toBeVisible();
  await expectAccessible(page);
  await expectNoOverflow(page);
  await page.goto('/notifications');
  await expect(page.getByText(/Nothing yet\./)).toBeVisible();
  await expect(bell(page)).toHaveAccessibleName('Notifications');
  await grace.context.close();
});

test('an archived Box keeps its comments readable but closed', async ({
  page,
  browser,
}) => {
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  await signedIn(page, adaAccount);
  const grace = await personOnOwnSession(browser, graceAccount);
  const boxUrl = await sharedBox(page, grace.page, graceAccount);
  await post(page, 'Last call');
  const permalink = await openPermalink(grace.page, boxUrl);
  await comment(grace.page, 'Goodbye for now');

  await page.goto(boxUrl);
  await page.getByRole('button', { name: 'Archive this Box' }).click();
  await expect(
    page.getByRole('button', { name: 'Restore this Box' }),
  ).toBeVisible();

  await grace.page.goto(permalink);
  await expect(
    grace.page.getByText(
      'This Box is archived. Comments and reactions are read-only.',
    ),
  ).toBeVisible();
  await expect(grace.page.getByText('Goodbye for now')).toBeVisible();
  await expect(grace.page.getByLabel('Add a comment')).toHaveCount(0);
  await expect(
    grace.page.getByRole('button', {
      name: /^React with|^More reactions|^Reply$|^Edit$/,
    }),
  ).toHaveCount(0);
  await expectAccessible(grace.page);
  await expectNoOverflow(grace.page);
  await grace.context.close();
});

test('reaction shortcuts chosen in Settings lead the bar', async ({ page }) => {
  const account = provisionAccount({ complete: true });
  await signedIn(page, account);
  await page.goto('/boxes');
  await page.getByLabel('Box name').fill('Just me');
  await page.getByRole('button', { name: 'Create Box' }).click();
  await expect(page).toHaveURL(/\/boxes\/[0-9a-f-]{36}$/);
  const boxUrl = page.url();
  await post(page, 'Shortcut test');

  await page.goto('/settings/reactions');
  await expect(page.getByRole('link', { name: 'Reactions' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('button', { name: 'Shortcut 1: 👍. Change' }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose shortcut 1' });
  await dialog.getByLabel('Any emoji').fill('🦄');
  await dialog.getByLabel('Any emoji').press('Enter');
  await expect(
    page.getByRole('button', { name: 'Shortcut 1: 🦄. Change' }),
  ).toBeFocused();
  await expectAccessible(page);
  await expectNoOverflow(page);
  await page.getByRole('button', { name: 'Save shortcuts' }).click();
  await expect(
    page.getByText('Saved. Your reaction bar uses these now.'),
  ).toBeVisible();

  await page.goto(boxUrl);
  const reactions = postOn(page)
    .getByRole('list', { name: 'Reactions' })
    .getByRole('button', { name: /^React with/ });
  await expect(reactions.first()).toHaveAccessibleName('React with 🦄');
  await expect(
    postOn(page).getByRole('button', { name: 'React with 👍', exact: true }),
  ).toHaveCount(0);

  // Reset restores the defaults once saved.
  await page.goto('/settings/reactions');
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(
    page.getByText('Defaults restored. Save to keep them.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save shortcuts' }).click();
  await expect(
    page.getByText('Saved. Your reaction bar uses these now.'),
  ).toBeVisible();
  await page.goto(boxUrl);
  await expect(reactions.first()).toHaveAccessibleName('React with 👍');
});
