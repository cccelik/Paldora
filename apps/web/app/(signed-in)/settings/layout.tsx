import styles from '@/(signed-in)/settings/layout.module.css';
import { LegalLinks } from '@/components/legal/legal-links';
import { SettingsNav } from '@/components/shell/settings-nav';
import { type ReactNode } from 'react';
/** Figma W10: a Settings title, a list of sections on the left, the section on the right. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>
      <div className={styles.body}>
        <SettingsNav />
        <div className={styles.content}>{children}</div>
      </div>
      <footer>
        <LegalLinks label="Policies and contact" />
      </footer>
    </div>
  );
}
