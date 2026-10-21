import styles from '@/(signed-in)/settings/appearance/page.module.css';
import { AppearanceForm } from '@/components/account/appearance-form';
import { roomHref } from '@/lib/rooms/room-theme';
import { completedUser } from '@/lib/server/session';
import { type Route } from 'next';
import Link from 'next/link';
export const metadata = { title: 'Appearance' };

export default async function AppearanceSettingsPage() {
  const user = await completedUser();
  const { username } = user.profile;
  return (
    <section className={styles.section} aria-labelledby="appearance-title">
      <h2 id="appearance-title" className={styles.sectionTitle}>
        App appearance
      </h2>
      <p className={styles.sectionDetail}>
        Saved to your account, so it follows you to every device.
      </p>
      <p className={styles.sectionDetail}>
        Your Room theme is chosen in Customize, on{' '}
        {username ? (
          <Link href={roomHref(username) as Route}>your Room</Link>
        ) : (
          'your Room'
        )}
        . This setting only affects the app around it.
      </p>
      <AppearanceForm current={user.preferences.appearance} />
    </section>
  );
}
