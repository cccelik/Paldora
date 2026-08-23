import type { CurrentUser, UserId } from '@paldora/domain';
import { notFound } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { AuthLayout } from '../../components/auth-layout';
import { SignInForm } from '../../components/auth-forms';
import { AvatarUploader } from '../../components/avatar-uploader';
import { OnboardingLayout } from '../../components/onboarding-layout';
import {
  ProfileSetupForm,
  SettingsForm,
  UsernameForm,
} from '../../components/profile-forms';
import {
  FeedbackMessage,
  PageHeader,
  SurfaceCard,
  UsernameField,
} from '../../components/ui';

const previewUser: CurrentUser = {
  user: {
    id: '00000000-0000-0000-0000-000000000001' as UserId,
    email: 'alice@example.com',
    status: 'active',
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  },
  profile: {
    userId: '00000000-0000-0000-0000-000000000001' as UserId,
    username: 'alice_moreno',
    displayName: 'Alice Moreno',
    bio: 'Learning pottery, keeping tiny moments, and making Berlin feel like home.',
    avatarUrl: null,
    onboardingState: 'complete',
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  },
};

// The development-only gallery keeps its deterministic screenshot variants in
// one entry point; it is not shipped as an application route in production.
export default async function PhaseOneDesignPreview({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { screen } = await searchParams;
  if (screen === 'username')
    return (
      <OnboardingLayout
        step={1}
        title="Choose your username"
        description="This is how your people will find and recognize you."
      >
        <UsernameForm />
      </OnboardingLayout>
    );
  if (screen === 'profile')
    return (
      <OnboardingLayout
        step={2}
        title="Tell us about yourself"
        description="A little context helps this place feel like yours."
      >
        <ProfileSetupForm />
      </OnboardingLayout>
    );
  if (screen === 'avatar')
    return (
      <OnboardingLayout
        step={3}
        title="Add a profile photo"
        description="Help the people you know recognize you at a glance."
      >
        <AvatarUploader onboarding />
      </OnboardingLayout>
    );
  if (screen === 'settings')
    return (
      <AppShell current={previewUser} active="settings">
        <PageHeader
          className="settings-heading"
          eyebrow="Personal details"
          title="Account settings"
          description="Keep the identity your people see up to date."
        />
        <div className="settings-layout">
          <SurfaceCard
            className="profile-settings-card"
            title="Profile information"
          >
            <SettingsForm
              username="alice_moreno"
              displayName="Alice Moreno"
              bio={previewUser.profile.bio ?? ''}
            />
          </SurfaceCard>
          <aside className="settings-side">
            <SurfaceCard title="Profile photo">
              <AvatarUploader />
            </SurfaceCard>
            <SurfaceCard className="account-summary" title="Account">
              <dl>
                <div>
                  <dt>Email</dt>
                  <dd>alice@example.com</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>Provisioned demo</dd>
                </div>
              </dl>
            </SurfaceCard>
          </aside>
        </div>
      </AppShell>
    );
  if (screen === 'username-error')
    return (
      <OnboardingLayout
        step={1}
        title="Choose your username"
        description="This is how your people will find and recognize you."
      >
        <form className="form-stack">
          <UsernameField defaultValue="paldora" prefixed readOnly />
          <FeedbackMessage variant="notice" tone="error">
            Username unavailable. Try another one.
          </FeedbackMessage>
          <button className="button-primary" type="button">
            Continue
          </button>
        </form>
      </OnboardingLayout>
    );
  if (screen === 'errors')
    return (
      <main className="error-state-board">
        <p className="eyebrow">Paldora form system</p>
        <h1>Clear help, without blame.</h1>
        <div className="error-state-grid">
          <section>
            <h2>Invalid credentials</h2>
            <FeedbackMessage variant="notice" tone="error">
              Those credentials did not match a provisioned account.
            </FeedbackMessage>
          </section>
          <section>
            <h2>Username unavailable</h2>
            <FeedbackMessage variant="notice" tone="error">
              Username unavailable. Try another one.
            </FeedbackMessage>
          </section>
          <section>
            <h2>Expired link</h2>
            <FeedbackMessage variant="notice" tone="error">
              This reset link is invalid or has expired.
            </FeedbackMessage>
          </section>
          <section>
            <h2>Network error</h2>
            <FeedbackMessage variant="notice" tone="error">
              Something went wrong. Try again.
            </FeedbackMessage>
          </section>
          <section>
            <h2>Success</h2>
            <FeedbackMessage variant="notice" tone="success">
              Changes saved.
            </FeedbackMessage>
          </section>
        </div>
      </main>
    );
  return (
    <AuthLayout
      title="Welcome back"
      description="Return to the people and memories you keep close."
    >
      <SignInForm />
    </AuthLayout>
  );
}
