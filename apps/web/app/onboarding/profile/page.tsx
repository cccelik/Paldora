import { OnboardingLayout } from '../../components/onboarding-layout';
import { ProfileStepForm } from '../../components/profile-forms';
import { userOnStep } from '../../lib/session';

export const metadata = { title: 'About you' };

export default async function ProfileStepPage() {
  const user = await userOnStep('profile');
  return (
    <OnboardingLayout
      step={2}
      title="Tell your people who you are"
      description="Your name shows on everything you share. Add a short bio if you like."
    >
      <ProfileStepForm
        displayName={user.profile.displayName ?? ''}
        bio={user.profile.bio ?? ''}
      />
    </OnboardingLayout>
  );
}
