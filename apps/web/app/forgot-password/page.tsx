import { AuthLayout } from '../components/auth-layout';
import { ForgotPasswordForm } from '../components/auth-forms';

export const metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your account email and we’ll send you a link to choose a new password."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
