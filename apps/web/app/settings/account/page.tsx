import { signOutAction } from '../../actions/auth';
import type { Route } from 'next';
import Link from 'next/link';
import { AppShell } from '../../components/app-shell';
import { AvatarUploader } from '../../components/avatar-uploader';
import { SettingsForm } from '../../components/profile-forms';
import { ReactionPresetEditor } from '../../components/reaction-preset-editor';
import { PageHeader, SurfaceCard } from '../../components/ui';
import { loadCurrentUser } from '../../lib/api';
import { roomCustomizePath } from '../../lib/room-paths';

export const dynamic = 'force-dynamic';

export default async function AccountSettingsPage() {
  const current = await loadCurrentUser();
  return (
    <AppShell current={current} active="settings">
      <PageHeader
        className="settings-heading"
        eyebrow="Personal details"
        title="Account settings"
        description="Keep the identity your people see up to date."
      />
      <div className="settings-layout">
        <div className="settings-main">
          <SurfaceCard
            className="profile-settings-card"
            title="Profile information"
          >
            <SettingsForm
              username={current.profile.username ?? ''}
              displayName={current.profile.displayName ?? ''}
              bio={current.profile.bio ?? ''}
            />
          </SurfaceCard>
          <SurfaceCard title="Reaction shortcuts">
            <ReactionPresetEditor presets={current.profile.reactionPresets} />
          </SurfaceCard>
          <SurfaceCard title="Personalization">
            <div className="settings-link-list">
              {current.profile.username && (
                <Link href={roomCustomizePath(current.profile.username)}>
                  Customize your Room
                </Link>
              )}
              <Link href={'/settings/appearance' as Route}>
                Application appearance
              </Link>
            </div>
          </SurfaceCard>
        </div>
        <aside className="settings-side">
          <SurfaceCard title="Profile photo">
            <AvatarUploader currentUrl={current.profile.avatarUrl} />
          </SurfaceCard>
          <SurfaceCard className="account-summary" title="Account">
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
          </SurfaceCard>
        </aside>
      </div>
    </AppShell>
  );
}
