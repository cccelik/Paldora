import type { ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { RealtimeBridge } from '../components/realtime-bridge';
import { ToastProvider } from '../components/toast';
import { publicEnvironment } from '../lib/environment';
import { apiClient, completedUser } from '../lib/session';

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
  // The count is a convenience: if it fails, the shell still renders.
  const unread = await (
    await apiClient()
  )
    .unreadNotificationCount()
    .catch(() => ({ count: 0, capped: false }));
  const environment = publicEnvironment();
  return (
    <ToastProvider>
      <AppShell user={user} unread={unread}>
        <RealtimeBridge
          apiUrl={environment.NEXT_PUBLIC_API_URL}
          supabaseUrl={environment.NEXT_PUBLIC_SUPABASE_URL}
          supabaseAnonKey={environment.NEXT_PUBLIC_SUPABASE_ANON_KEY}
        />
        {children}
      </AppShell>
    </ToastProvider>
  );
}
