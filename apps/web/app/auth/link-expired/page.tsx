import { AuthLayout } from '@/components/auth/auth-layout';
import { buttonClassName } from '@/components/ui';
import Link from 'next/link';
export const metadata = { title: 'Link expired' };

export default function LinkExpiredPage() {
  return (
    <AuthLayout
      title="That link has expired"
      description="Links from Paldora emails work once and only for a short time. Request a new one to continue."
    >
      <Link
        className={buttonClassName('primary', { block: true })}
        href="/forgot-password"
      >
        Request a new link
      </Link>
    </AuthLayout>
  );
}
