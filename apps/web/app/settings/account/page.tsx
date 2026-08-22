import { signOutAction } from '../../actions/auth';
import { AppShell } from '../../components/app-shell';
import { AvatarUploader } from '../../components/avatar-uploader';
import { SettingsForm } from '../../components/profile-forms';
import { loadCurrentUser } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function AccountSettingsPage() {
  const current = await loadCurrentUser();
  return (
    <AppShell current={current} active="settings">
      <header className="app-page-header settings-heading">
        <div>
          <p className="eyebrow">Personal details</p>
          <h1>Account settings</h1>
          <p>Keep the identity your people see up to date.</p>
        </div>
      </header>
      <div className="settings-layout">
        <section className="settings-card profile-settings-card">
          <h2>Profile information</h2>
          <SettingsForm
            username={current.profile.username ?? ''}
            displayName={current.profile.displayName ?? ''}
            bio={current.profile.bio ?? ''}
          />
        </section>
        <aside className="settings-side">
          <section className="settings-card">
            <h2>Profile photo</h2>
            <AvatarUploader currentUrl={current.profile.avatarUrl} />
          </section>
          <section className="settings-card account-summary">
            <h2>Account</h2>
            <dl>
              <div>
                <dt>Email</dt>
                <dd>{current.user.email}</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>Provisioned demo</dd>
              </div>
              <div>
                <dt>Member since</dt>
                <dd>
                  {new Date(current.user.createdAt).toLocaleDateString('en', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </dd>
              </div>
            </dl>
            <a className="text-link" href="/forgot-password">
              Reset password
            </a>
            <form action={signOutAction}>
              <button className="button-secondary full-width" type="submit">
                Sign out
              </button>
            </form>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
