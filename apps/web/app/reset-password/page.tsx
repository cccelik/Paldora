import Link from 'next/link';
import { AuthLayout } from '../components/auth-layout';
import { ResetPasswordForm } from '../components/auth-forms';
import { buttonClassName } from '../components/ui';
import { accessToken } from '../lib/session';

export const metadata = { title: 'Choose a new password' };

/** Reached from a recovery link (or settings) with a valid session. */
export default async function ResetPasswordPage() {
  const hasSession = Boolean(await accessToken());
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
        <ResetPasswordForm />
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
