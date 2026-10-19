import { AvatarUploader } from '../../components/avatar-uploader';
import { OnboardingLayout } from '../../components/onboarding-layout';
import { loadCurrentUser } from '../../lib/api';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AvatarOnboardingPage() {
  const current = await loadCurrentUser();
  if (current.profile.onboardingState === 'username')
    redirect('/onboarding/username');
  if (current.profile.onboardingState === 'profile')
    redirect('/onboarding/profile');
  if (current.profile.onboardingState === 'complete') redirect('/home');
  return (
    <OnboardingLayout
      step={3}
      title="Add a profile photo"
      description="Help the people you know recognize you at a glance."
    >
      <AvatarUploader currentUrl={current.profile.avatarUrl} onboarding />
    </OnboardingLayout>
  );
}
