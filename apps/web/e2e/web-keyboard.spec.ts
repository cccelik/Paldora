import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectSound } from './support/a11y';

if (
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error(
    'This browser suite requires the disposable Firebase emulators.',
  );

const password = 'LocalFixturePassw0rd!';
const maxTabs = 80;

const suffixOf = (testInfo: { project: { name: string } }) =>
  testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';

const isFocused = (locator: Locator) =>
  locator
    .first()
    .evaluate((el) => el === document.activeElement)
    .catch(() => false);

/** Press Tab until the locator's element has focus; fails if it never does. */
async function tabTo(page: Page, locator: Locator, label: string) {
  for (let i = 0; i < maxTabs; i += 1) {
    if (await isFocused(locator)) return;
    await page.keyboard.press('Tab');
  }
  expect(await isFocused(locator), `Tab never reached: ${label}`).toBe(true);
}

/** The focused element must show an outline or a box-shadow ring. */
async function expectVisibleFocus(page: Page, label: string) {
  // Text fields draw their ring on the wrapping control (:focus-within), so the
  // indicator may sit on the focused element or on one of its near ancestors.
  const ring = await page.evaluate(() => {
    let el: Element | null = document.activeElement;
    if (!el || el === document.body) return null;
    for (let depth = 0; el && depth < 4; depth += 1, el = el.parentElement) {
      const style = getComputedStyle(el);
      const outline =
        style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      if (outline || style.boxShadow !== 'none') return { visible: true };
    }
    return { visible: false };
  });
  expect(ring, `${label} has focus`).not.toBeNull();
  expect(ring!.visible, `${label} shows a focus indicator`).toBe(true);
}

/** Setup only: the interactions under test are all keyboard. */
async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/boxes$/);
}

/** Setup: a Box and one post, then the post's own page. */
async function boxWithPostPage(page: Page, suffix: string, text: string) {
  await signIn(page, `phase6-reporter-${suffix}@example.invalid`);
  await page.getByLabel('Box name').fill(`Keyboard Circle ${suffix}`);
  await page.getByRole('button', { name: 'Create Box' }).click();
  await expect(page).toHaveURL(/\/boxes\/[0-9a-f-]{36}$/);
  await page.getByLabel('Share with this Box').fill(text);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  const post = page.getByRole('article', { name: 'Post by Local Reporter' });
  await expect(post).toContainText(text);
  const href = await post.getByRole('link').first().getAttribute('href');
  expect(href).toMatch(/^\/posts\/[0-9a-f-]{36}$/);
  await page.goto(href!);
}

test('sign-in is reachable and submittable by keyboard alone', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const suffix = suffixOf(testInfo);
  await page.goto('/sign-in');
  const email = page.getByLabel('Email');
  const pass = page.getByLabel('Password');
  const submit = page.getByRole('button', { name: 'Sign in' });

  await tabTo(page, email, 'Email');
  await expectVisibleFocus(page, 'Email');
  await page.keyboard.type(`phase6-reporter-${suffix}@example.invalid`);
  await page.keyboard.press('Tab');
  await expect(pass).toBeFocused();
  await expectVisibleFocus(page, 'Password');
  await page.keyboard.type(password);
  await page.keyboard.press('Tab');
  await expect(submit).toBeFocused();
  await expectVisibleFocus(page, 'Sign in');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/boxes$/);
  await expectSound(page);
});

test('Enter in the password field submits the sign-in form', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const suffix = suffixOf(testInfo);
  await page.goto('/sign-in');
  await tabTo(page, page.getByLabel('Email'), 'Email');
  await page.keyboard.type(`phase6-reporter-${suffix}@example.invalid`);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password')).toBeFocused();
  await page.keyboard.type(password);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/boxes$/);
  await expectSound(page);
});

test('a post is composed and published from the keyboard with a visible focus ring', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = suffixOf(testInfo);
  await signIn(page, `phase6-reporter-${suffix}@example.invalid`);
  await page.getByLabel('Box name').fill(`Keyboard Compose ${suffix}`);
  await page.getByRole('button', { name: 'Create Box' }).click();
  await expect(page).toHaveURL(/\/boxes\/[0-9a-f-]{36}$/);

  const textarea = page.getByLabel('Share with this Box');
  const post = page.getByRole('button', { name: 'Post', exact: true });
  await tabTo(page, textarea, 'composer textarea');
  await expectVisibleFocus(page, 'composer textarea');
  // Nothing to post yet, so the button is not in the tab order.
  await expect(post).toBeDisabled();
  await page.keyboard.type('Typed and posted without a mouse');
  await expect(post).toBeEnabled();
  // Other composer controls (photos) sit between the textarea and Post.
  await tabTo(page, post, 'Post button');
  await expectVisibleFocus(page, 'Post button');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('article', { name: 'Post by Local Reporter' }),
  ).toContainText('Typed and posted without a mouse');
  await expect(textarea).toHaveValue('');
  await expectSound(page);
});

test('a comment is written and submitted from the keyboard', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await boxWithPostPage(page, suffixOf(testInfo), 'Keyboard comment target');
  const field = page.getByLabel('Add a comment');
  const submit = page.getByRole('button', { name: 'Comment', exact: true });
  await tabTo(page, field, 'comment textarea');
  await expectVisibleFocus(page, 'comment textarea');
  await page.keyboard.type('A comment typed by keyboard');
  await expect(submit).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(submit).toBeFocused();
  await expectVisibleFocus(page, 'Comment button');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('list', { name: 'Comments' })).toContainText(
    'A comment typed by keyboard',
  );
  await expectSound(page);
});

test('the reaction chooser traps focus, closes on Escape and returns focus', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await boxWithPostPage(page, suffixOf(testInfo), 'Keyboard reaction target');
  const trigger = page
    .getByRole('button', { name: 'More reactions', exact: true })
    .first();
  const dialog = page.getByRole('dialog', { name: 'Choose a reaction' });
  const insideDialog = () =>
    dialog.evaluate((d) => d.contains(document.activeElement));
  // A native modal dialog makes the page inert. After its last control Tab may
  // leave for the browser UI (activeElement is the body), which is fine; what
  // must never happen is focus landing on page content behind the dialog.
  const onPageBehind = () =>
    dialog.evaluate((d) => {
      const active = document.activeElement;
      return !!active && active !== document.body && !d.contains(active);
    });

  await tabTo(page, trigger, 'More reactions');
  await expectVisibleFocus(page, 'More reactions');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  expect(await insideDialog(), 'focus moved into the dialog').toBe(true);
  await expectVisibleFocus(page, 'first dialog control');

  // Forward and backward past every control: focus never reaches the page.
  for (let i = 0; i < 45; i += 1) {
    await page.keyboard.press('Tab');
    expect(await onPageBehind(), `Tab ${i + 1} stays off the page`).toBe(false);
  }
  for (let i = 0; i < 45; i += 1) {
    await page.keyboard.press('Shift+Tab');
    expect(await onPageBehind(), `Shift+Tab ${i + 1} stays off the page`).toBe(
      false,
    );
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expectVisibleFocus(page, 'More reactions after close');

  // A choice made by keyboard closes the dialog, applies it, and returns focus.
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  const choice = dialog.getByRole('button', { name: 'React with 🎉' });
  for (let i = 0; i < 45 && !(await isFocused(choice)); i += 1)
    await page.keyboard.press('Tab');
  await expect(choice).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: /React with 🎉/ }).first(),
  ).toHaveAttribute('aria-pressed', 'true');
  await expectSound(page);
});

test('Room customize exposes its controls and reorders widgets by keyboard', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = suffixOf(testInfo);
  await signIn(page, `phase123-room-${suffix}@example.invalid`);
  await page.goto(`/rooms/phase123room${suffix}/customize`);
  await expect(
    page.getByRole('heading', { name: 'Customize your Room' }),
  ).toBeVisible();

  const order = page.getByRole('list', { name: 'Widget order' });
  await expect(order.getByRole('listitem')).toHaveCount(7);
  const names = () =>
    order
      .locator('[class*="rowName"]')
      .allTextContents()
      .then((all) => all.map((t) => t.replace(/^\s*\d+\.\s*/, '').trim()));
  const before = await names();
  const first = before[0]!;
  const second = before[1]!;

  const down = order.getByRole('button', {
    name: `Move ${first} down, position 1 of 7`,
  });
  await tabTo(page, down, `Move ${first} down`);
  await expectVisibleFocus(page, 'Move down');
  await page.keyboard.press('Enter');
  await expect(
    page.getByText(`${first} moved to position 2 of 7.`),
  ).toBeAttached();
  const after = await names();
  expect(after[0]).toBe(second);
  expect(after[1]).toBe(first);

  // Focus stays with the item that moved, on the same direction's button.
  await expect(
    order.getByRole('button', {
      name: `Move ${first} down, position 2 of 7`,
    }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    order.getByRole('button', { name: `Move ${first} up, position 2 of 7` }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await names()).toEqual(before);

  // The section's save button is reachable by Tab (never saved here).
  await tabTo(
    page,
    page.getByRole('button', { name: 'Save widgets' }),
    'Save widgets',
  );
  await expectVisibleFocus(page, 'Save widgets');
  await expectSound(page);
});

test('account deletion confirmation is labelled, reachable and survives Escape', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = suffixOf(testInfo);
  await signIn(page, `phase7-${suffix}@example.invalid`);
  await page.goto('/settings/account');

  const field = page.getByLabel('Confirm your password');
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveAccessibleName('Confirm your password');
  const submit = page.getByRole('button', {
    name: /^(Request account deletion|Cancel deletion)$/,
  });
  await tabTo(page, field, 'deletion password');
  await expectVisibleFocus(page, 'deletion password');

  // There is no modal: Escape must not clear, navigate or break the form.
  const url = page.url();
  await page.keyboard.type('not-the-password');
  await page.keyboard.press('Escape');
  expect(page.url()).toBe(url);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('not-the-password');

  await page.keyboard.press('Tab');
  await expect(submit).toBeFocused();
  await expectVisibleFocus(page, 'deletion submit');
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('That password did not match your account.'),
  ).toBeVisible();
  await expect(field).toBeVisible();
  await expectSound(page);
});
