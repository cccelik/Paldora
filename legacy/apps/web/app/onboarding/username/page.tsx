import { loadCurrentUser } from '../../lib/api';
import { OnboardingLayout } from '../../components/onboarding-layout';
import { UsernameForm } from '../../components/profile-forms';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function UsernameOnboardingPage() {
  const current = await loadCurrentUser();
  if (current.profile.onboardingState === 'profile')
    redirect('/onboarding/profile');
  if (current.profile.onboardingState === 'avatar')
    redirect('/onboarding/avatar');
  if (current.profile.onboardingState === 'complete') redirect('/home');
  return (
    <OnboardingLayout
      step={1}
      title="Choose your username"
      description="This is how your people will find and recognize you."
    >
      <UsernameForm username={current.profile.username ?? ''} />
    </OnboardingLayout>
  );
}
