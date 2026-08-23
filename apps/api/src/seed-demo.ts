import { createClient } from '@supabase/supabase-js';
import { parseDemoSeedEnvironment } from '@paldora/config';
import { createDatabaseConnection, profiles, users } from '@paldora/database';
import { normalizeUsername } from '@paldora/validation';
import { eq } from 'drizzle-orm';

async function seedDemo(): Promise<void> {
  const environment = parseDemoSeedEnvironment(process.env);
  const supabase = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const listed = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1_000,
  });
  if (listed.error) throw listed.error;
  const connection = createDatabaseConnection(environment.DATABASE_URL);
  try {
    const accounts = [
      {
        email: environment.DEMO_USER_EMAIL,
        password: environment.DEMO_USER_PASSWORD,
        username: environment.DEMO_USERNAME,
        displayName: environment.DEMO_DISPLAY_NAME,
      },
      ...(environment.DEMO_FRIEND_EMAIL &&
      environment.DEMO_FRIEND_PASSWORD &&
      environment.DEMO_FRIEND_USERNAME &&
      environment.DEMO_FRIEND_DISPLAY_NAME
        ? [
            {
              email: environment.DEMO_FRIEND_EMAIL,
              password: environment.DEMO_FRIEND_PASSWORD,
              username: environment.DEMO_FRIEND_USERNAME,
              displayName: environment.DEMO_FRIEND_DISPLAY_NAME,
            },
          ]
        : []),
    ];
    for (const account of accounts) {
      let authUser = listed.data.users.find(
        (candidate) =>
          candidate.email?.toLocaleLowerCase('en-US') ===
          account.email.toLocaleLowerCase('en-US'),
      );
      if (!authUser) {
        const created = await supabase.auth.admin.createUser({
          email: account.email,
          password: account.password,
          email_confirm: true,
        });
        if (created.error) throw created.error;
        authUser = created.data.user;
      }
      const emailNormalized = account.email.trim().toLocaleLowerCase('en-US');
      const [appUser] = await connection.database
        .insert(users)
        .values({
          authSubject: authUser.id,
          email: account.email,
          emailNormalized,
        })
        .onConflictDoUpdate({
          target: users.authSubject,
          set: {
            email: account.email,
            emailNormalized,
            status: 'active',
            updatedAt: new Date(),
          },
        })
        .returning({ id: users.id });
      if (!appUser) throw new Error('Demo user upsert returned no row.');
      await connection.database
        .insert(profiles)
        .values({
          userId: appUser.id,
          username: account.username,
          usernameNormalized: normalizeUsername(account.username),
          displayName: account.displayName,
          onboardingState: 'complete',
        })
        .onConflictDoUpdate({
          target: profiles.userId,
          set: {
            username: account.username,
            usernameNormalized: normalizeUsername(account.username),
            displayName: account.displayName,
            onboardingState: 'complete',
            updatedAt: new Date(),
          },
        });
      const [result] = await connection.database
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, appUser.id));
      process.stdout.write(`Provisioned demo account ${result?.email ?? ''}\n`);
    }
  } finally {
    await connection.close();
  }
}

void seedDemo().catch((error: unknown) => {
  process.stderr.write(
    `Demo provisioning failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
