import { UsernameStepForm } from '@/components/account/profile-forms';
import { OnboardingLayout } from '@/components/auth/onboarding-layout';
import { userOnStep } from '@/lib/server/session';
export const metadata = { title: 'Choose your username' };

export default async function UsernameStepPage() {
  const user = await userOnStep('username');
  return (
    <OnboardingLayout
      step={1}
      title="Choose your username"
      description="This is how the people you know will find and recognize you."
    >
      <UsernameStepForm username={user.profile.username ?? ''} />
    </OnboardingLayout>
  );
}
