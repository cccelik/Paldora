import { expect, test, type Page } from '@playwright/test';
import { expectSound } from './support/a11y';

const password = 'LocalFixturePassw0rd!';

const pages = [
  { path: '/privacy', heading: 'Privacy', draft: true },
  { path: '/terms', heading: 'Terms', draft: true },
  { path: '/guidelines', heading: 'Community guidelines', draft: false },
  { path: '/contact', heading: 'Contact and appeals', draft: false },
] as const;

const linkNames = [
  'Privacy',
  'Terms',
  'Community guidelines',
  'Contact and appeals',
];

async function expectOneCsp(page: Page, path: string) {
  const response = await page.request.get(path);
  const csp = response
    .headersArray()
    .filter(
      (header) => header.name.toLowerCase() === 'content-security-policy',
    );
  expect(csp, path).toHaveLength(1);
  expect(csp[0]?.value).not.toMatch(/script-src[^;]*'unsafe-inline'/);
}

test('robots.txt disallows every crawler and every response says noindex', async ({
  page,
}) => {
  const robots = await page.request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  const body = await robots.text();
  expect(body).toMatch(/User-Agent: \*/i);
  expect(body).toMatch(/^Disallow: \/$/m);
  expect(body).not.toMatch(/^Allow:/im);
  expect(robots.headers()['x-robots-tag']).toContain('noindex');
  for (const path of ['/', '/sign-in', ...pages.map((entry) => entry.path)]) {
    const response = await page.request.get(path);
    expect(response.headers()['x-robots-tag'], path).toContain('noindex');
    expect(response.headers()['x-robots-tag'], path).toContain('nofollow');
  }
  await page.goto('/privacy');
  const meta = await page
    .locator('meta[name="robots"]')
    .getAttribute('content');
  expect(meta).toContain('noindex');
  expect(meta).toContain('nofollow');
  expect(meta).not.toMatch(/(^|,\s*)index(,|$)/);
});

for (const entry of pages) {
  test(`${entry.path} renders signed out, accessible, with one CSP`, async ({
    page,
  }) => {
    const response = await page.goto(entry.path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${entry.path}$`));
    await expect(
      page.getByRole('heading', { level: 1, name: entry.heading }),
    ).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(
      page.getByRole('navigation', { name: 'About Paldora' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText(/Last updated/)).toBeVisible();
    const notice = page.getByText('Draft pending owner and legal review');
    await expect(notice).toHaveCount(entry.draft ? 1 : 0);
    await expectSound(page);
    await expectOneCsp(page, entry.path);
  });
}

test('the contact page is honest when no address is configured', async ({
  page,
}) => {
  await page.goto('/contact');
  await expect(
    page.getByText('No contact address is configured'),
  ).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  await expect(page.getByText(/@/)).toHaveCount(0);
});

test('the sign-in footer links every information page', async ({ page }) => {
  await page.goto('/sign-in');
  const nav = page.getByRole('navigation', { name: 'About Paldora' });
  for (const name of linkNames)
    await expect(nav.getByRole('link', { name })).toBeVisible();
  await nav.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expectSound(page);
});

test('footer links are reachable by keyboard with a visible focus ring', async ({
  page,
}) => {
  await page.goto('/terms');
  const link = page
    .getByRole('navigation', { name: 'About Paldora' })
    .getByRole('link', { name: 'Privacy' });
  let focused = false;
  for (let i = 0; i < 20 && !focused; i += 1) {
    await page.keyboard.press('Tab');
    focused = await link.evaluate((el) => el === document.activeElement);
  }
  expect(focused).toBe(true);
  const outline = await link.evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThan(0);
});

test('the pages work signed in, and Settings links to them', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const suffix = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  await page.goto('/sign-in');
  await page
    .getByLabel('Email')
    .fill(`phase6-reporter-${suffix}@example.invalid`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/boxes$/);

  await page.goto('/settings/account');
  const nav = page.getByRole('navigation', { name: 'Policies and contact' });
  for (const name of linkNames)
    await expect(nav.getByRole('link', { name })).toBeVisible();
  await nav.getByRole('link', { name: 'Community guidelines' }).click();
  await expect(page).toHaveURL(/\/guidelines$/);
  await expect(
    page.getByRole('link', { name: 'Back to Paldora' }),
  ).toBeVisible();
  await expectSound(page);
});

test('icons and manifest are served and pages declare an icon', async ({
  page,
}) => {
  const icon = await page.request.get('/icon.svg');
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toContain('image/svg+xml');
  const apple = await page.request.get('/apple-icon');
  expect(apple.status()).toBe(200);
  expect(apple.headers()['content-type']).toContain('image/png');
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  const json = (await manifest.json()) as { name: string; theme_color: string };
  expect(json.name).toBe('Paldora');
  expect(json.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  await page.goto('/sign-in');
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute(
    'href',
    /icon\.svg/,
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]').first()).toBeAttached();
});
