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
  let authUser = listed.data.users.find(
    (candidate) =>
      candidate.email?.toLocaleLowerCase('en-US') ===
      environment.DEMO_USER_EMAIL.toLocaleLowerCase('en-US'),
  );
  if (!authUser) {
    const created = await supabase.auth.admin.createUser({
      email: environment.DEMO_USER_EMAIL,
      password: environment.DEMO_USER_PASSWORD,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    authUser = created.data.user;
  }

  const connection = createDatabaseConnection(environment.DATABASE_URL);
  try {
    const emailNormalized =
      environment.DEMO_USER_EMAIL.trim().toLocaleLowerCase('en-US');
    const [appUser] = await connection.database
      .insert(users)
      .values({
        authSubject: authUser.id,
        email: environment.DEMO_USER_EMAIL,
        emailNormalized,
      })
      .onConflictDoUpdate({
        target: users.authSubject,
        set: {
          email: environment.DEMO_USER_EMAIL,
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
        username: environment.DEMO_USERNAME,
        usernameNormalized: normalizeUsername(environment.DEMO_USERNAME),
        displayName: environment.DEMO_DISPLAY_NAME,
        onboardingState: 'complete',
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          username: environment.DEMO_USERNAME,
          usernameNormalized: normalizeUsername(environment.DEMO_USERNAME),
          displayName: environment.DEMO_DISPLAY_NAME,
          onboardingState: 'complete',
          updatedAt: new Date(),
        },
      });
    const [result] = await connection.database
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, appUser.id));
    process.stdout.write(`Provisioned demo account ${result?.email ?? ''}\n`);
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
