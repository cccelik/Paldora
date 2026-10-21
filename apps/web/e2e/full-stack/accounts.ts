import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { fullStackEnvironment } from '../playwright.fullstack.config';

const provisionScript = fileURLToPath(
  new URL('../../../api/dist/provisioning/provision.js', import.meta.url),
);

export interface Account {
  readonly email: string;
  readonly password: string;
  readonly username: string;
}

const unique = () => randomUUID().replace(/-/g, '').slice(0, 10);

/**
 * Provisions through the real admin script, against the loopback auth
 * stand-in. `complete` pre-fills username and name, as `--demo` would.
 */
export function provisionAccount(
  options: { complete?: boolean } = {},
): Account {
  const id = unique();
  const account = {
    email: `e2e-${id}@example.test`,
    password: `correct horse ${id}`,
    username: `e2e_${id}`,
  };
  const args = [
    provisionScript,
    '--email',
    account.email,
    '--password-env',
    'E2E_PASSWORD',
  ];
  if (options.complete) {
    args.push('--username', account.username, '--display-name', `Tester ${id}`);
  }
  execFileSync(process.execPath, args, {
    env: {
      ...process.env,
      ...fullStackEnvironment,
      E2E_PASSWORD: account.password,
    },
    stdio: 'pipe',
  });
  return account;
}

/** An identity that exists in auth only, never provisioned in Paldora. */
export async function identityOnly(): Promise<Account> {
  const id = unique();
  const account = {
    email: `ghost-${id}@example.test`,
    password: `ghost pass ${id}`,
    username: '',
  };
  const response = await fetch(
    `${fullStackEnvironment.SUPABASE_URL}/auth/v1/admin/users`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${fullStackEnvironment.SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
      }),
    },
  );
  expect(response.ok).toBe(true);
  return account;
}

export async function signIn(
  page: Page,
  account: Pick<Account, 'email' | 'password'>,
) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
