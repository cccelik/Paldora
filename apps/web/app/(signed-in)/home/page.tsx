import Link from 'next/link';
import { Avatar, buttonClassName } from '../../components/ui';
import { completedUser } from '../../lib/session';
import styles from './page.module.css';

export const metadata = { title: 'Home' };

export default async function HomePage() {
  const user = await completedUser();
  const { profile } = user;
  return (
    <div className={styles.page}>
      <section className={styles.welcome} aria-labelledby="welcome-title">
        <Avatar
          url={profile.avatar?.url}
          name={profile.displayName}
          size="large"
        />
        <div className={styles.text}>
          <p className={styles.eyebrow}>@{profile.username}</p>
          <h1 id="welcome-title" className={styles.title}>
            Welcome, {profile.displayName}.
          </h1>
          {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
        </div>
      </section>
      <section className={styles.note} aria-labelledby="note-title">
        <h2 id="note-title" className={styles.noteTitle}>
          Your corner is ready
        </h2>
        <p className={styles.noteDetail}>
          Paldora is in private testing. Your profile is set up; Boxes for the
          people you share with come next.
        </p>
        <Link className={buttonClassName('secondary')} href="/settings/account">
          Edit your profile
        </Link>
      </section>
    </div>
  );
}
