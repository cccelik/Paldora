import { SignInForm } from '@/components/auth/auth-forms';
import { AuthLayout } from '@/components/auth/auth-layout';
export const metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to the Boxes and people you keep close."
    >
      <SignInForm />
    </AuthLayout>
  );
}
