import { AuthLayout } from '../components/auth-layout';
import { ResetPasswordForm } from '../components/auth-forms';

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      title="Reset password"
      description="Choose a new password for your Paldora account."
    >
      <ResetPasswordForm />
    </AuthLayout>
  );
}
