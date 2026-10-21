import { signOutAction } from '../actions/auth';
import { AuthLayout } from '../components/auth-layout';
import { SubmitButton } from '../components/submit-button';
export const metadata = { title: 'Account unavailable' };

/** Signed in with the identity provider, but no usable Paldora account. */
export default function AccountUnavailablePage() {
  return (
    <AuthLayout
      title="This account isn’t available"
      description="It hasn’t been set up for Paldora, or it has been paused. If you think this is a mistake, contact the person who invited you."
    >
      <form action={signOutAction}>
        <SubmitButton pendingLabel="Signing out…" block>
          Sign out
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
