import { chromium, expect, test, type Page } from '@playwright/test';
import { provisionAccount } from './accounts';
import {
  expectAccessible,
  expectNoOverflow,
  personOnOwnSession,
  sharedBox,
  signedIn,
} from './sessions';

/**
 * Camera reactions run on Chromium's fake camera (see the full-stack
 * config). Upload, the worker, and the projector all take a few polls, so
 * waits are generous; nothing sleeps for a fixed time.
 */
const processed = { timeout: 45_000 };
const postOn = (page: Page) => page.getByRole('article', { name: /Post by/ });
const cameraButton = (page: Page) =>
  postOn(page).getByRole('button', { name: /camera/i });
const cameraDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Camera reaction' });
const strip = (page: Page) =>
  postOn(page).getByRole('list', { name: 'Camera reactions' });

async function post(page: Page, text: string) {
  await page.getByLabel('Share with this Box').fill(text);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText(text)).toBeVisible();
}

async function openPermalink(page: Page, boxUrl: string) {
  await page.goto(boxUrl);
  await postOn(page)
    .getByRole('link', { name: 'Comment', exact: true })
    .click();
  await expect(page).toHaveURL(/\/posts\/[0-9a-f-]{36}#comments$/);
  return page.url().replace(/#comments$/, '');
}

/** The dialog fits and passes axe; checked from the top of the page. */
async function expectCleanState(page: Page) {
  await expectAccessible(page);
  await expectNoOverflow(page);
}

test('a camera reaction is sent, shown, notified, and replaced by an emoji', async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const adaAccount = provisionAccount({ complete: true });
  const graceAccount = provisionAccount({ complete: true });
  const ada = await personOnOwnSession(browser, adaAccount);
  await signedIn(page, graceAccount);
  const boxUrl = await sharedBox(ada.page, page, graceAccount);
  await post(ada.page, 'Guess who got a puppy');
  const permalink = await openPermalink(page, boxUrl);

  // Live, mirrored preview from the fake camera.
  await cameraButton(page).click();
  const dialog = cameraDialog(page);
  await expect(dialog).toBeVisible();
  const take = dialog.getByRole('button', { name: 'Take photo' });
  await expect(take).toBeEnabled(processed);
  await expect(dialog.getByLabel('Camera preview')).toBeVisible();
  await expectCleanState(page);

  // Captured: Retake goes back to live, then Send.
  await take.click();
  await expect(
    dialog.getByRole('img', { name: 'Your photo, ready to send' }),
  ).toBeVisible();
  await expectCleanState(page);
  await dialog.getByRole('button', { name: 'Retake' }).click();
  await expect(take).toBeEnabled(processed);
  await take.click();
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(
    dialog.getByText('Sent. Your camera reaction is on the post.'),
  ).toBeVisible(processed);
  await expectCleanState(page);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

  // The strip shows her processed thumbnail, and it survives a reload.
  await expect(
    strip(page).getByRole('img', { name: /’s camera reaction$/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    strip(page).getByRole('img', { name: /’s camera reaction$/ }),
  ).toHaveCount(1);
  await expect(cameraButton(page)).toHaveAccessibleName(
    'Camera reaction (yours is sent). Take a new one',
  );

  // The full list, filtered to camera reactions.
  await postOn(page)
    .getByRole('link', { name: 'See all camera reactions' })
    .click();
  await expect(page).toHaveURL(/\/reactions\?kind=real$/);
  await expect(
    page
      .getByRole('list', { name: 'Reactions' })
      .getByRole('img', { name: /’s camera reaction$/ }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Camera' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expectCleanState(page);

  // Ada hears about it, with the thumbnail.
  await ada.page.goto('/notifications');
  const notified = ada.page.getByRole('button', {
    name: /sent a camera reaction to your post in Weekend crew/,
  });
  await expect(async () => {
    await ada.page.reload();
    await expect(notified).toBeVisible({ timeout: 2_000 });
  }).toPass(processed);
  await expect(notified.locator('img')).toHaveCount(1);
  await expectCleanState(ada.page);

  // An emoji replaces the camera image, and the image is gone for good.
  await page.goto(permalink);
  await postOn(page)
    .getByRole('button', { name: 'React with 👍', exact: true })
    .click();
  await expect(
    postOn(page).getByRole('button', { name: 'React with 👍. 1 person' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(strip(page)).toHaveCount(0);
  await page.reload();
  await expect(strip(page)).toHaveCount(0);
  await expect(cameraButton(page)).toHaveAccessibleName(
    'React with your camera',
  );
  await page.goto(`${permalink}/reactions?kind=real`);
  await expect(page.getByText('No camera reactions yet.')).toBeVisible();

  // Comments never get a camera button.
  await page.goto(permalink);
  const field = page.getByLabel('Add a comment');
  await field.fill('So cute');
  await field.press('ControlOrMeta+Enter');
  const commentRow = page
    .getByRole('article', { name: /^Comment by/ })
    .filter({ hasText: 'So cute' });
  await expect(commentRow).toBeVisible();
  await expect(commentRow.getByRole('button', { name: /camera/i })).toHaveCount(
    0,
  );

  // Nor does an archived Box.
  await ada.page.goto(boxUrl);
  await ada.page.getByRole('button', { name: 'Archive this Box' }).click();
  await expect(
    ada.page.getByRole('button', { name: 'Restore this Box' }),
  ).toBeVisible();
  await page.goto(permalink);
  await expect(
    page.getByText(
      'This Box is archived. Comments and reactions are read-only.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /camera/i })).toHaveCount(0);
  await ada.context.close();
});

test('a blocked camera explains itself, retries, and leaves emoji working', async () => {
  // A browser whose camera prompt always answers "Block".
  const blockedBrowser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream=deny',
    ],
  });
  const account = provisionAccount({ complete: true });
  const grace = await personOnOwnSession(blockedBrowser, account);
  const { page } = grace;
  // Count real camera requests, so "Try again" is shown to ask again.
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices;
    const ask = devices.getUserMedia.bind(devices);
    const counted = window as unknown as { cameraRequests: number };
    counted.cameraRequests = 0;
    devices.getUserMedia = (constraints) => {
      counted.cameraRequests += 1;
      return ask(constraints);
    };
  });
  const requests = () =>
    page.evaluate(
      () => (window as unknown as { cameraRequests: number }).cameraRequests,
    );
  await page.goto('/boxes');
  await page.getByLabel('Box name').fill('Just me');
  await page.getByRole('button', { name: 'Create Box' }).click();
  await expect(page).toHaveURL(/\/boxes\/[0-9a-f-]{36}$/);
  await post(page, 'Camera shy');

  await cameraButton(page).click();
  const dialog = cameraDialog(page);
  const blocked = dialog
    .getByRole('status')
    .filter({ hasText: 'Camera access was blocked' });
  await expect(blocked).toBeVisible();
  await expect(
    dialog.getByText(/allow the camera for this site/),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Take photo' })).toHaveCount(
    0,
  );
  await expectCleanState(page);
  expect(await requests()).toBe(1);

  // Try again really asks the browser again (and is told no again).
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(requests).toBe(2);
  await expect(blocked).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Try again' })).toBeFocused();

  // Back out; emoji reactions still work.
  await dialog.getByRole('button', { name: 'Back to emoji reactions' }).click();
  await expect(dialog).toBeHidden();
  await expect(cameraButton(page)).toBeFocused();
  await postOn(page)
    .getByRole('button', { name: 'React with 😮', exact: true })
    .click();
  await expect(
    postOn(page).getByRole('button', { name: 'React with 😮. 1 person' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(strip(page)).toHaveCount(0);
  await blockedBrowser.close();
});
