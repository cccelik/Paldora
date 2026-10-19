import type { ReactNode } from 'react';
import { SettingsNav } from '../../components/settings-nav';
import styles from './settings.module.css';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <SettingsNav />
      </header>
      {children}
    </div>
  );
}
