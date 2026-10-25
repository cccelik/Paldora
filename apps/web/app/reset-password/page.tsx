import { ResetPasswordForm } from '@/components/auth/auth-forms';
import { AuthLayout } from '@/components/auth/auth-layout';
import { buttonClassName } from '@/components/ui';

import Link from 'next/link';
export const metadata = { title: 'Choose a new password' };

/** Reached from a recovery link (or settings) with a valid session. */
export default async function ResetPasswordPage({
  searchParams,
}: PageProps<'/reset-password'>) {
  const code = (await searchParams).oobCode;
  const oobCode =
    typeof code === 'string' && code.length <= 2048 ? code : undefined;
  const hasSession = Boolean(oobCode);
  return (
    <AuthLayout
      title="Choose a new password"
      description={
        hasSession
          ? 'Use at least 10 characters. A passphrase works well.'
          : 'This reset link is invalid or has expired.'
      }
    >
      {hasSession ? (
        <ResetPasswordForm oobCode={oobCode} />
      ) : (
        <Link
          className={buttonClassName('primary', { block: true })}
          href="/forgot-password"
        >
          Request a new link
        </Link>
      )}
    </AuthLayout>
  );
}
