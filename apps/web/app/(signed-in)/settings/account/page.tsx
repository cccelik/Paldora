import styles from '@/(signed-in)/settings/account/page.module.css';
import {
  AccountDeletionControls,
  AccountExportControls,
} from '@/components/account/account-lifecycle-controls';
import { AccountForm } from '@/components/account/profile-forms';
import { AvatarUploader } from '@/components/media/avatar-uploader';
import { TextField } from '@/components/ui';
import { apiClient, completedUser } from '@/lib/server/session';
import Link from 'next/link';
export const metadata = { title: 'Account settings' };

export default async function AccountSettingsPage() {
  const { user, profile } = await completedUser();
  const client = await apiClient();
  const [exportState, deletionState] = await Promise.all([
    client.accountExport(),
    client.accountDeletion(),
  ]);
  return (
    <>
      <section className={styles.section} aria-labelledby="photo-title">
        <h2 id="photo-title" className={styles.sectionTitle}>
          Profile photo
        </h2>
        <AvatarUploader
          currentUrl={profile.avatar?.url ?? null}
          name={profile.displayName}
          processing={profile.avatarProcessing}
        />
      </section>
      <section className={styles.section} aria-labelledby="profile-title">
        <h2 id="profile-title" className={styles.sectionTitle}>
          Profile
        </h2>
        <AccountForm
          username={profile.username ?? ''}
          displayName={profile.displayName ?? ''}
          bio={profile.bio ?? ''}
        />
      </section>
      <section className={styles.section} aria-labelledby="sign-in-title">
        <h2 id="sign-in-title" className={styles.sectionTitle}>
          Sign-in
        </h2>
        <TextField
          label="Email"
          id="email"
          value={user.email}
          readOnly
          help="Your sign-in email can’t be changed here yet."
        />
        <Link className={styles.link} href="/reset-password">
          Change your password
        </Link>
      </section>
      <section className={styles.section} aria-labelledby="export-title">
        <h2 id="export-title" className={styles.sectionTitle}>
          Export your data
        </h2>
        <AccountExportControls status={exportState.export?.status ?? null} />
      </section>
      <section className={styles.section} aria-labelledby="deletion-title">
        <h2 id="deletion-title" className={styles.sectionTitle}>
          Delete your account
        </h2>
        <AccountDeletionControls
          dueAt={deletionState.deletion?.dueAt ?? null}
        />
      </section>
    </>
  );
}
