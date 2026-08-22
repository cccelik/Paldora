import { loadCurrentUser } from '../../lib/api';
import { OnboardingLayout } from '../../components/onboarding-layout';
import { ProfileSetupForm } from '../../components/profile-forms';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProfileOnboardingPage() {
  const current = await loadCurrentUser();
  if (current.profile.onboardingState === 'username')
    redirect('/onboarding/username');
  if (current.profile.onboardingState === 'avatar')
    redirect('/onboarding/avatar');
  if (current.profile.onboardingState === 'complete') redirect('/home');
  return (
    <OnboardingLayout
      step={2}
      title="Tell us about yourself"
      description="A little context helps this place feel like yours."
    >
      <ProfileSetupForm
        displayName={current.profile.displayName ?? ''}
        bio={current.profile.bio ?? ''}
      />
    </OnboardingLayout>
  );
}
