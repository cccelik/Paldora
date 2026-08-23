import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBoxAction } from '../../actions/social';
import { AppShell } from '../../components/app-shell';
import { loadCurrentUser } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function NewBoxPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const current = await loadCurrentUser();
  if (current.profile.onboardingState !== 'complete')
    redirect(`/onboarding/${current.profile.onboardingState}`);
  const { error } = await searchParams;
  return (
    <AppShell current={current} active="boxes">
      <header className="app-page-header">
        <div>
          <p className="eyebrow">A new private circle</p>
          <h1>Create a Box</h1>
          <p>Start with a name. You can invite friends after it is created.</p>
        </div>
      </header>
      <section className="settings-card focused-form-card">
        <form className="form-stack" action={createBoxAction}>
          {error && (
            <p className="form-message error" role="alert">
              {error}
            </p>
          )}
          <label>
            Box name
            <input
              name="name"
              required
              maxLength={80}
              autoFocus
              placeholder="Sunday table"
            />
            <small>1–80 characters. Visible only to Box members.</small>
          </label>
          <div className="form-actions">
            <button className="button-primary" type="submit">
              Create private Box
            </button>
            <Link className="button-quiet" href="/boxes">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
