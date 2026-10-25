import { ToastProvider } from '@/components/common/toast';
import { RealtimeBridge } from '@/components/realtime/realtime-bridge';
import { AppShell } from '@/components/shell/app-shell';

import { firebaseWebData } from '@/lib/server/firebase/data';
import { completedUser } from '@/lib/server/session';
import { type ReactNode } from 'react';
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
  {
    const unread = await (await firebaseWebData()).unreadNotificationCount();
    return (
      <ToastProvider>
        <AppShell user={user} unread={unread}>
          <RealtimeBridge />
          {children}
        </AppShell>
      </ToastProvider>
    );
  }
}
