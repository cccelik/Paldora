import type { ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { RealtimeBridge } from '../components/realtime-bridge';
import { publicEnvironment } from '../lib/environment';
import { completedUser } from '../lib/session';

/**
 * Signed-in pages. This check is for navigation only: layouts do not re-run
 * on every navigation, and the API authorizes every data request anyway.
 */
export default async function SignedInLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await completedUser();
  const environment = publicEnvironment();
  return (
    <AppShell user={user}>
      <RealtimeBridge
        apiUrl={environment.NEXT_PUBLIC_API_URL}
        supabaseUrl={environment.NEXT_PUBLIC_SUPABASE_URL}
        supabaseAnonKey={environment.NEXT_PUBLIC_SUPABASE_ANON_KEY}
      />
      {children}
    </AppShell>
  );
}
