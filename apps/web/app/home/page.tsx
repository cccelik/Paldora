import { redirect } from 'next/navigation';
import { AppShell } from '../components/app-shell';
import { loadCurrentUser } from '../lib/api';

export const dynamic = 'force-dynamic';

const onboardingRoute = {
  username: '/onboarding/username',
  profile: '/onboarding/profile',
  avatar: '/onboarding/avatar',
} as const;

export default async function HomePage() {
  const current = await loadCurrentUser();
  if (current.profile.onboardingState !== 'complete')
    redirect(onboardingRoute[current.profile.onboardingState]);
  return (
    <AppShell current={current} active="home">
      <header className="app-page-header">
        <div>
          <p className="eyebrow">Your private corner</p>
          <h1>Home</h1>
          <p>Latest from your people</p>
        </div>
        <div className="header-avatar" aria-hidden="true">
          {current.profile.avatarUrl ? (
            <img src={current.profile.avatarUrl} alt="" />
          ) : (
            (current.profile.displayName ?? current.user.email)
              .slice(0, 1)
              .toUpperCase()
          )}
        </div>
      </header>
      <section className="empty-home">
        <div className="empty-box-art" aria-hidden="true">
          <span>✦</span>
          <div>□</div>
        </div>
        <p className="eyebrow">The beginning</p>
        <h2>Your circles arrive next.</h2>
        <p>
          Your profile is ready. Boxes, posts, and the chronological feed will
          be introduced in the next product milestones—there is no pretend
          activity here.
        </p>
        <LinkButton />
      </section>
    </AppShell>
  );
}

function LinkButton() {
  return (
    <a className="button-secondary inline-button" href="/settings/account">
      Review your profile
    </a>
  );
}
