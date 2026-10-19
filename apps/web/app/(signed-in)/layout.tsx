import type { ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
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
  return <AppShell user={user}>{children}</AppShell>;
}
