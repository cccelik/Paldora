import { parseProvisioningEnvironment } from '@paldora/config';
import { createDatabaseConnection } from '@paldora/database';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import { normalizeEmail, provisionUser } from './provision-user.js';

/**
 * Trusted administrative provisioning (public signup stays disabled until
 * Phase 9). Run by an operator, never by a deployed service:
 *
 *   pnpm --filter @paldora/api provision --email ada@example.com
 *   pnpm --filter @paldora/api provision --email ada@example.com \
 *     --username ada --display-name "Ada" --password-env ADA_PASSWORD
 *   pnpm --filter @paldora/api provision --demo
 *
 * Without a password the person sets one through "Forgot password". Secrets
 * are read from the environment and never printed.
 */
interface Account {
  email: string;
  username?: string | undefined;
  displayName?: string | undefined;
  password?: string | undefined;
}

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    username: { type: 'string' },
    'display-name': { type: 'string' },
    'password-env': { type: 'string' },
    demo: { type: 'boolean', default: false },
  },
});

function demoAccounts(): Account[] {
  const prefixes = ['DEMO_USER', 'DEMO_FRIEND'];
  return prefixes.flatMap((prefix) => {
    const email = process.env[`${prefix}_EMAIL`];
    if (!email) return [];
    const usernameKey =
      prefix === 'DEMO_USER' ? 'DEMO_USERNAME' : 'DEMO_FRIEND_USERNAME';
    const nameKey =
      prefix === 'DEMO_USER' ? 'DEMO_DISPLAY_NAME' : 'DEMO_FRIEND_DISPLAY_NAME';
    return [
      {
        email,
        username: process.env[usernameKey],
        displayName: process.env[nameKey],
        password: process.env[`${prefix}_PASSWORD`],
      },
    ];
  });
}

function requestedAccounts(): Account[] {
  if (values.demo) return demoAccounts();
  if (!values.email) {
    throw new Error('Pass --email <address> or --demo.');
  }
  const passwordKey = values['password-env'];
  return [
    {
      email: values.email,
      username: values.username,
      displayName: values['display-name'],
      password: passwordKey ? process.env[passwordKey] : undefined,
    },
  ];
}

async function findAuthUserId(
  supabase: SupabaseClient,
  email: string,
): Promise<string | undefined> {
  const wanted = normalizeEmail(email);
  for (let page = 1; page <= 50; page += 1) {
    // Pages are fetched in order until the address is found or the list ends.
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`Listing identities failed: ${error.message}`);
    const match = data.users.find(
      (user) => user.email && normalizeEmail(user.email) === wanted,
    );
    if (match) return match.id;
    if (data.users.length < 200) return undefined;
  }
  throw new Error('Too many identities to search; look the user up manually.');
}

async function ensureAuthUser(
  supabase: SupabaseClient,
  account: Account,
): Promise<string> {
  const existing = await findAuthUserId(supabase, account.email);
  if (existing) {
    if (account.password) {
      const { error } = await supabase.auth.admin.updateUserById(existing, {
        password: account.password,
      });
      if (error)
        throw new Error(`Updating the identity failed: ${error.message}`);
    }
    return existing;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: account.email,
    email_confirm: true,
    ...(account.password ? { password: account.password } : {}),
  });
  if (error) throw new Error(`Creating the identity failed: ${error.message}`);
  return data.user.id;
}

async function main(): Promise<void> {
  const environment = parseProvisioningEnvironment(process.env);
  const accounts = requestedAccounts();
  if (accounts.length === 0) throw new Error('No accounts to provision.');
  const supabase = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const connection = createDatabaseConnection({
    connectionString: environment.DATABASE_URL,
    poolMax: 2,
    applicationName: 'paldora-provisioning',
  });
  try {
    for (const account of accounts) {
      // One account at a time keeps identity and database writes paired.
      // eslint-disable-next-line no-await-in-loop
      const subject = await ensureAuthUser(supabase, account);
      // eslint-disable-next-line no-await-in-loop
      const result = await provisionUser(connection.database, {
        subject,
        email: account.email,
        username: account.username,
        displayName: account.displayName,
      });
      process.stdout.write(
        `${result.created ? 'Provisioned' : 'Reconciled'} ${normalizeEmail(account.email)}${
          account.password
            ? ''
            : ' (no password set: use "Forgot password" to choose one)'
        }\n`,
      );
    }
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Provisioning failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
