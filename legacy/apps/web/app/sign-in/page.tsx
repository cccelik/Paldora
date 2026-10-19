import { AuthLayout } from '../components/auth-layout';
import { SignInForm } from '../components/auth-forms';

export default function SignInPage() {
  return (
    <AuthLayout
      title="Welcome back"
      description="Return to the people and memories you keep close."
    >
      <SignInForm />
    </AuthLayout>
  );
}
