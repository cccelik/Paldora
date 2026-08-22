import { AuthLayout } from '../components/auth-layout';
import { ForgotPasswordForm } from '../components/auth-forms';

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Forgot password?"
      description="We’ll email a secure link to reset your password."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
