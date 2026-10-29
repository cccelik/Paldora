import { LegalLinks } from '@/components/legal/legal-links';
import { buttonClassName, Wordmark } from '@/components/ui';
import styles from '@/page.module.css';
import Link from 'next/link';
const promises = [
  {
    title: 'Private by default',
    detail: 'Everything you share stays inside the Boxes you choose.',
  },
  {
    title: 'Chronological, always',
    detail:
      'No ranking, no targeted ads, no feed engineered to keep you scrolling.',
  },
  {
    title: 'Made to last',
    detail:
      'Your memories belong to you, organized into a scrapbook you can keep.',
  },
];

export default function LandingPage() {
  return (
    <>
      <header className={styles.header}>
        <Wordmark />
        <Link className={buttonClassName('secondary')} href="/sign-in">
          Sign in
        </Link>
      </header>
      <main id="main" className={styles.main}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <p className={styles.eyebrow}>A quieter corner of the internet</p>
          <h1 id="hero-title" className={styles.title}>
            A box for <em>your people.</em>
          </h1>
          <p className={styles.intro}>
            The private living scrapbook for the friendships, tiny moments, and
            chapters you want to keep.
          </p>
          <p className={styles.status}>
            Paldora is in private testing. Accounts are created by invitation.
          </p>
        </section>
        <section aria-labelledby="promises-title">
          <h2 id="promises-title" className="visually-hidden">
            Our promises
          </h2>
          <ul className={styles.promises}>
            {promises.map((promise) => (
              <li key={promise.title} className={styles.promise}>
                <h3 className={styles.promiseTitle}>{promise.title}</h3>
                <p className={styles.promiseDetail}>{promise.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className={styles.footer}>
        <LegalLinks />
      </footer>
    </>
  );
}
