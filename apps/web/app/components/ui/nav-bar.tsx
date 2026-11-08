import { Icon } from '@/components/ui/icons';
import { iconButtonClassName } from '@/components/ui/icon-button';
import styles from '@/components/ui/nav-bar.module.css';
import { type Route } from 'next';
import Link from 'next/link';
import { type ReactNode } from 'react';
/**
 * Figma "Nav bar" (44:200): Back, Close or Action, with a centred Label/M
 * title between two 40px circular buttons. Leading is a link, so it works
 * without JavaScript; `action` is a slot for an `IconButton` or button.
 */
export function NavBar({
  title,
  back,
  close,
  action,
}: {
  title: string;
  back?: { href: string; label?: string };
  close?: { href: string; label?: string };
  action?: ReactNode;
}) {
  const leading = back ?? close;
  return (
    <div className={styles.bar}>
      <div className={styles.side}>
        {leading ? (
          <Link
            href={leading.href as Route}
            className={iconButtonClassName('surface', 40)}
            aria-label={leading.label ?? (back ? 'Back' : 'Close')}
          >
            <Icon name={back ? 'back' : 'close'} size={20} />
          </Link>
        ) : null}
      </div>
      <p className={styles.title}>{title}</p>
      <div className={`${styles.side} ${styles.end}`}>{action}</div>
    </div>
  );
}
