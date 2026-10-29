import styles from '@/(signed-in)/settings/layout.module.css';
import { LegalLinks } from '@/components/legal/legal-links';
import { SettingsNav } from '@/components/shell/settings-nav';
import { type ReactNode } from 'react';
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <SettingsNav />
      </header>
      {children}
      <footer>
        <LegalLinks label="Policies and contact" />
      </footer>
    </div>
  );
}
