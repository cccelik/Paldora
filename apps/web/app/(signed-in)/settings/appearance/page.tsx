import { AppearanceForm } from '../../../components/appearance-form';
import { completedUser } from '../../../lib/session';
import styles from '../settings.module.css';

export const metadata = { title: 'Appearance' };

export default async function AppearanceSettingsPage() {
  const user = await completedUser();
  return (
    <section className={styles.section} aria-labelledby="appearance-title">
      <h2 id="appearance-title" className={styles.sectionTitle}>
        App appearance
      </h2>
      <p className={styles.sectionDetail}>
        Saved to your account, so it follows you to every device.
      </p>
      <AppearanceForm current={user.preferences.appearance} />
    </section>
  );
}
