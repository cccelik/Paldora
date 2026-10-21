import Link from 'next/link';
import styles from './status-page.module.css';
export const metadata = { title: 'Not found' };

/**
 * Also the shared "missing or not yours" state: private resources a viewer
 * cannot access render this same page so absence and denial look identical.
 */
export default function NotFound() {
  return (
    <main id="main" className={styles.page}>
      <h1 className={styles.title}>This page isn’t here.</h1>
      <p className={styles.detail}>
        It may have moved, or it may belong to a Box you’re not part of.
      </p>
      <Link className={styles.action} href="/">
        Back to Paldora
      </Link>
    </main>
  );
}
