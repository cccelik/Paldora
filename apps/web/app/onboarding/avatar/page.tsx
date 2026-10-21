import { finishOnboardingAction } from '@/actions/profile';
import { OnboardingLayout } from '@/components/auth/onboarding-layout';
import { SubmitButton } from '@/components/forms/submit-button';
import { AvatarUploader } from '@/components/media/avatar-uploader';
import { userOnStep } from '@/lib/server/session';
import styles from '@/onboarding/avatar/page.module.css';
export const metadata = { title: 'Add a photo' };

export default async function AvatarStepPage() {
  const user = await userOnStep('avatar');
  const hasPhoto =
    Boolean(user.profile.avatar) || user.profile.avatarProcessing;
  return (
    <OnboardingLayout
      step={3}
      title="Add a profile photo"
      description="Help your people recognize you at a glance. You can change it any time."
    >
      <AvatarUploader
        currentUrl={user.profile.avatar?.url ?? null}
        name={user.profile.displayName}
        processing={user.profile.avatarProcessing}
        allowRemove={false}
      />
      <form action={finishOnboardingAction} className={styles.finish}>
        <SubmitButton
          variant={hasPhoto ? 'primary' : 'quiet'}
          pendingLabel="Finishing…"
          block={hasPhoto}
        >
          {hasPhoto ? 'Finish setup' : 'Skip for now'}
        </SubmitButton>
      </form>
    </OnboardingLayout>
  );
}
